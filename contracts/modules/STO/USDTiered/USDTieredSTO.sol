// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../STO.sol";
import "../../../interfaces/IPolymathRegistry.sol";
import "../../../interfaces/IOracle.sol";
import "../../../libraries/DecimalMath.sol";
import "./USDTieredSTOStorage.sol";
import "../../../external/TradingRestrictionManager/ITradingRestrictionManager.sol";


/**
 * @title STO module for standard capped crowdsale
 */
contract USDTieredSTO is USDTieredSTOStorage, STO {

    string internal constant POLY_ORACLE = "PolyUsdOracle";
    string internal constant ETH_ORACLE = "EthUsdOracle";

    ////////////
    // Events //
    ////////////

    event SetAllowBeneficialInvestments(bool _allowed);
    event SetNonAccreditedLimit(address _investor, uint256 _limit);
    event TokenPurchase(
        address indexed _purchaser,
        address indexed _beneficiary,
        uint256 _tokens,
        uint256 _usdAmount,
        uint256 _tierPrice,
        uint256 _tier
    );
    event FundsReceived(
        address indexed _purchaser,
        address indexed _beneficiary,
        uint256 _usdAmount,
        FundRaiseType _fundRaiseType,
        uint256 _receivedValue,
        uint256 _spentValue,
        uint256 _rate
    );
    event ReserveTokenMint(address indexed _owner, address indexed _wallet, uint256 _tokens, uint256 _latestTier);
    event SetAddresses(address indexed _wallet, IERC20[] _usdTokens);
    event SetLimits(uint256 _nonAccreditedLimitUSD, uint256 _minimumInvestmentUSD);
    event SetTimes(uint256 _startTime, uint256 _endTime);
    event SetTiers(
        uint256[] _ratePerTier,
        uint256[] _ratePerTierDiscountPoly,
        uint256[] _tokensPerTierTotal,
        uint256[] _tokensPerTierDiscountPoly
    );
    event SetTreasuryWallet(address _oldWallet, address _newWallet);

    ///////////////
    // Modifiers //
    ///////////////

    modifier validETH() {
        require(_getOracle(bytes32("ETH"), bytes32("USD")) != address(0), "Invalid Oracle");
        require(fundRaiseTypes[uint8(FundRaiseType.ETH)], "ETH not allowed");
        _;
    }

    modifier validPOLY() {
        require(_getOracle(bytes32("POLY"), bytes32("USD")) != address(0), "Invalid Oracle");
        require(fundRaiseTypes[uint8(FundRaiseType.POLY)], "POLY not allowed");
        _;
    }

    modifier validSC(address _usdToken) {
        require(fundRaiseTypes[uint8(FundRaiseType.SC)] && usdTokenEnabled[_usdToken], "USD not allowed");
        _;
    }

    ///////////////////////
    // STO Configuration //
    ///////////////////////

    constructor(address _securityToken, address _polyAddress) Module(_securityToken, _polyAddress) {

    }

    /**
     * @notice Function used to intialize the contract variables
     * @param _startTime Unix timestamp at which offering get started
     * @param _endTime Unix timestamp at which offering get ended
     * @param _ratePerTier Rate (in USD) per tier (* 10**18)
     * @param _tokensPerTierTotal Tokens available in each tier
     * @param _nonAccreditedLimitUSD Limit in USD (* 10**18) for non-accredited investors
     * @param _minimumInvestmentUSD Minimun investment in USD (* 10**18)
     * @param _fundRaiseTypes Types of currency used to collect the funds
     * @param _wallet Ethereum account address to hold the funds
     * @param _treasuryWallet Ethereum account address to receive unsold tokens
     * @param _usdTokens Contract address of the stable coins
     */
    function configure(
        uint256 _startTime,
        uint256 _endTime,
        uint256[] memory _ratePerTier,
        uint256[] memory _ratePerTierDiscountPoly,
        uint256[] memory _tokensPerTierTotal,
        uint256[] memory _tokensPerTierDiscountPoly,
        uint256 _nonAccreditedLimitUSD,
        uint256 _minimumInvestmentUSD,
        FundRaiseType[] memory _fundRaiseTypes,
        address payable _wallet,
        address _treasuryWallet,
        IERC20[] memory _usdTokens
    )
        public
        onlyFactory
    {
        oracleKeys[bytes32("ETH")][bytes32("USD")] = ETH_ORACLE;
        oracleKeys[bytes32("POLY")][bytes32("USD")] = POLY_ORACLE;
        require(endTime == 0, "Already configured");
        _modifyTimes(_startTime, _endTime);
        _modifyTiers(_ratePerTier, _ratePerTierDiscountPoly, _tokensPerTierTotal, _tokensPerTierDiscountPoly);
        // NB - _setFundRaiseType must come before modifyAddresses
        _setFundRaiseType(_fundRaiseTypes);
        _modifyAddresses(_wallet, _treasuryWallet, _usdTokens);
        _modifyLimits(_nonAccreditedLimitUSD, _minimumInvestmentUSD);
    }

    /**
     * @dev Modifies fund raise types
     * @param _fundRaiseTypes Array of fund raise types to allow
     */
    function modifyFunding(FundRaiseType[] calldata _fundRaiseTypes) external withPerm(OPERATOR) {
        _isSTOStarted();
        _setFundRaiseType(_fundRaiseTypes);
    }

    /**
     * @dev modifies max non accredited invets limit and overall minimum investment limit
     * @param _nonAccreditedLimitUSD max non accredited invets limit
     * @param _minimumInvestmentUSD overall minimum investment limit
     */
    function modifyLimits(uint256 _nonAccreditedLimitUSD, uint256 _minimumInvestmentUSD) external withPerm(OPERATOR) {
        _isSTOStarted();
        _modifyLimits(_nonAccreditedLimitUSD, _minimumInvestmentUSD);
    }

    /**
     * @dev modifiers STO tiers. All tiers must be passed, can not edit specific tiers.
     * @param _ratePerTier Array of rates per tier
     * @param _ratePerTierDiscountPoly Array of discounted poly rates per tier
     * @param _tokensPerTierTotal Array of total tokens per tier
     * @param _tokensPerTierDiscountPoly Array of discounted tokens per tier
     */
    function modifyTiers(
        uint256[] calldata _ratePerTier,
        uint256[] calldata _ratePerTierDiscountPoly,
        uint256[] calldata _tokensPerTierTotal,
        uint256[] calldata _tokensPerTierDiscountPoly
    )
        external
        withPerm(OPERATOR)
    {
        _isSTOStarted();
        _modifyTiers(_ratePerTier, _ratePerTierDiscountPoly, _tokensPerTierTotal, _tokensPerTierDiscountPoly);
    }

    /**
     * @dev Modifies STO start and end times
     * @param _startTime start time of sto
     * @param _endTime end time of sto
     */
    function modifyTimes(uint256 _startTime, uint256 _endTime) external withPerm(OPERATOR) {
        _isSTOStarted();
        _modifyTimes(_startTime, _endTime);
    }

    function _isSTOStarted() internal view {
        /*solium-disable-next-line security/no-block-members*/
        require(block.timestamp < startTime, "Already started");
    }

    /**
     * @dev Modifies addresses used as wallet, reserve wallet and usd token
     * @param _wallet Address of wallet where funds are sent
     * @param _treasuryWallet Address of wallet where unsold tokens are sent
     * @param _usdTokens Address of usd tokens
     */
    function modifyAddresses(address payable _wallet, address _treasuryWallet, IERC20[] calldata _usdTokens) external {
        _onlySecurityTokenOwner();
        _modifyAddresses(_wallet, _treasuryWallet, _usdTokens);
    }

    /**
     * @dev Modifies Oracle address.
     *      By default, Polymath oracles are used but issuer can overide them using this function
     *      Set _oracleAddress to 0x0 to fallback to using Polymath oracles
     * @param _fundRaiseType Actual currency
     * @param _oracleAddress address of the oracle
     */
    function modifyOracle(FundRaiseType _fundRaiseType, address _oracleAddress) external {
        _onlySecurityTokenOwner();
        if (_fundRaiseType == FundRaiseType.ETH) {
            customOracles[bytes32("ETH")][bytes32("USD")] = _oracleAddress;
        } else {
            require(_fundRaiseType == FundRaiseType.POLY, "Invalid currency");
            customOracles[bytes32("POLY")][bytes32("USD")] = _oracleAddress;
        }
    }

    function _modifyLimits(uint256 _nonAccreditedLimitUSD, uint256 _minimumInvestmentUSD) internal {
        minimumInvestmentUSD = _minimumInvestmentUSD;
        nonAccreditedLimitUSD = _nonAccreditedLimitUSD;
        emit SetLimits(minimumInvestmentUSD, nonAccreditedLimitUSD);
    }

    function _modifyTiers(
        uint256[] memory _ratePerTier,
        uint256[] memory _ratePerTierDiscountPoly,
        uint256[] memory _tokensPerTierTotal,
        uint256[] memory _tokensPerTierDiscountPoly
    )
        internal
    {
        require(
            _tokensPerTierTotal.length > 0 &&
            _ratePerTier.length == _tokensPerTierTotal.length &&
            _ratePerTierDiscountPoly.length == _tokensPerTierTotal.length &&
            _tokensPerTierDiscountPoly.length == _tokensPerTierTotal.length,
            "Invalid Input"
        );
        delete tiers;
        for (uint256 i = 0; i < _ratePerTier.length; i++) {
            require(_ratePerTier[i] > 0 && _tokensPerTierTotal[i] > 0, "Invalid value");
            require(_tokensPerTierDiscountPoly[i] <= _tokensPerTierTotal[i], "Too many discounted tokens");
            require(_ratePerTierDiscountPoly[i] <= _ratePerTier[i], "Invalid discount");
            tiers.push();
            Tier storage newTier = tiers[tiers.length - 1];
            newTier.rate = _ratePerTier[i];
            newTier.rateDiscountPoly = _ratePerTierDiscountPoly[i];
            newTier.tokenTotal = _tokensPerTierTotal[i];
            newTier.tokensDiscountPoly = _tokensPerTierDiscountPoly[i];
            // mintedTotal, mintedDiscountPoly, and the 'minted' mapping are default-initialized to zero.
        }
        emit SetTiers(_ratePerTier, _ratePerTierDiscountPoly, _tokensPerTierTotal, _tokensPerTierDiscountPoly);
    }

    function _modifyTimes(uint256 _startTime, uint256 _endTime) internal {
        /*solium-disable-next-line security/no-block-members*/
        require((_endTime > _startTime) && (_startTime > block.timestamp), "Invalid times");
        startTime = _startTime;
        endTime = _endTime;
        emit SetTimes(_startTime, _endTime);
    }

    function _modifyAddresses(address payable _wallet, address _treasuryWallet, IERC20[] memory _usdTokens) internal {
        require(_wallet != address(0), "Invalid wallet");
        wallet = _wallet;
        emit SetTreasuryWallet(treasuryWallet, _treasuryWallet);
        treasuryWallet = _treasuryWallet;
        _modifyUSDTokens(_usdTokens);
    }

    function _modifyUSDTokens(IERC20[] memory _usdTokens) internal {
        uint256 i;
        for(i = 0; i < usdTokens.length; i++) {
            usdTokenEnabled[address(usdTokens[i])] = false;
        }
        usdTokens = _usdTokens;
        for(i = 0; i < _usdTokens.length; i++) {
            require(address(_usdTokens[i]) != address(0) && _usdTokens[i] != polyToken, "Invalid USD token");
            usdTokenEnabled[address(_usdTokens[i])] = true;
        }
        emit SetAddresses(wallet, _usdTokens);
    }

    ////////////////////
    // STO Management //
    ////////////////////

    /**
     * @notice Finalizes the STO and mint remaining tokens to treasury address
     * @notice Treasury wallet address must be whitelisted to successfully finalize
     */
    function finalize() external withPerm(ADMIN) {
        require(!isFinalized, "STO is finalized");
        isFinalized = true;
        uint256 tempReturned;
        uint256 tempSold;
        uint256 remainingTokens;
        for (uint256 i = 0; i < tiers.length; i++) {
            remainingTokens = tiers[i].tokenTotal-(tiers[i].mintedTotal);
            tempReturned = tempReturned+(remainingTokens);
            tempSold = tempSold+(tiers[i].mintedTotal);
            if (remainingTokens > 0) {
                tiers[i].mintedTotal = tiers[i].tokenTotal;
            }
        }
        address walletAddress = (treasuryWallet == address(0) ? IDataStore(getDataStore()).getAddress(TREASURY) : treasuryWallet);
        require(walletAddress != address(0), "Invalid address");
        uint256 granularity = securityToken.granularity();
        tempReturned = tempReturned /(granularity);
        tempReturned = tempReturned*(granularity);
        securityToken.issue(walletAddress, tempReturned, "");
        emit ReserveTokenMint(msg.sender, walletAddress, tempReturned, currentTier);
        finalAmountReturned = tempReturned;
        totalTokensSold = tempSold;
    }

    /**
     * @notice Modifies the list of overrides for non-accredited limits in USD
     * @param _investors Array of investor addresses to modify
     * @param _nonAccreditedLimit Array of uints specifying non-accredited limits
     */
    function changeNonAccreditedLimit(address[] calldata _investors, uint256[] calldata _nonAccreditedLimit) external withPerm(OPERATOR) {
        //nonAccreditedLimitUSDOverride
        require(_investors.length == _nonAccreditedLimit.length, "Length mismatch");
        for (uint256 i = 0; i < _investors.length; i++) {
            nonAccreditedLimitUSDOverride[_investors[i]] = _nonAccreditedLimit[i];
            emit SetNonAccreditedLimit(_investors[i], _nonAccreditedLimit[i]);
        }
    }

    /**
     * @notice Returns investor accredited & non-accredited override informatiomn
     *  investors list of all configured investors
     *  accredited whether investor is accredited
     *  override any USD overrides for non-accredited limits for the investor
     */
    function getAccreditedData() external view returns (address[] memory investors, bool[] memory accredited, uint256[] memory overrides) {
        IDataStore dataStore = getDataStore();
        investors = dataStore.getAddressArray(INVESTORSKEY);
        accredited = new bool[](investors.length);
        overrides = new uint256[](investors.length);
        for (uint256 i = 0; i < investors.length; i++) {
            accredited[i] = _getIsAccredited(investors[i], dataStore);
            overrides[i] = nonAccreditedLimitUSDOverride[investors[i]];
        }
    }

    /**
     * @notice Function to set allowBeneficialInvestments (allow beneficiary to be different to funder)
     * @param _allowBeneficialInvestments Boolean to allow or disallow beneficial investments
     */
    function changeAllowBeneficialInvestments(bool _allowBeneficialInvestments) external withPerm(OPERATOR) {
        require(_allowBeneficialInvestments != allowBeneficialInvestments);
        allowBeneficialInvestments = _allowBeneficialInvestments;
        emit SetAllowBeneficialInvestments(allowBeneficialInvestments);
    }

    /**
    * @notice receive function - assumes ETH being invested
    */
    receive() external payable {
        buyWithETHRateLimited(msg.sender, 0);
    }

    // Buy functions without rate restriction
    fallback() external payable {
        buyWithETHRateLimited(msg.sender, 0);
    }

    // Buy functions without rate restriction
    function buyWithETH(address _beneficiary) external payable returns (uint256, uint256, uint256) {
        return buyWithETHRateLimited(_beneficiary, 0);
    }

    function buyWithPOLY(address _beneficiary, uint256 _investedPOLY) external returns (uint256, uint256, uint256) {
        return buyWithPOLYRateLimited(_beneficiary, _investedPOLY, 0);
    }

    function buyWithUSD(address _beneficiary, uint256 _investedSC, IERC20 _usdToken, bytes32[] calldata proof, uint64 expiry, bool isAccredited, ITradingRestrictionManager.InvestorClass investorClass) external returns (uint256, uint256, uint256) {
        if (address(restrictionManager) == address(0)) {    
            return buyWithUSDRateLimited(_beneficiary, _investedSC, 0, _usdToken);
        } else {
            require (
                ITradingRestrictionManager(restrictionManager).verifyInvestor(proof, _beneficiary, expiry, isAccredited, investorClass),
                "Investor verification failed"
            );
            return buyWithUSDRateLimited(_beneficiary, _investedSC, 0, _usdToken);
        }
    }

    // original function
    // function buyWithUSD(address _beneficiary, uint256 _investedSC, IERC20 _usdToken) external returns (uint256, uint256, uint256) {
    //     return buyWithUSDRateLimited(_beneficiary, _investedSC, 0, _usdToken);
    // }

    /**
      * @notice Purchase tokens using ETH
      * @param _beneficiary Address where security tokens will be sent
      * @param _minTokens Minumum number of tokens to buy or else revert
      */
    function buyWithETHRateLimited(address _beneficiary, uint256 _minTokens) public payable validETH returns (uint256, uint256, uint256) {
        (uint256 rate, uint256 spentUSD, uint256 spentValue, uint256 initialMinted) = _getSpentvalues(_beneficiary,  msg.value, FundRaiseType.ETH, _minTokens);
        // Modify storage
        investorInvested[_beneficiary][uint8(FundRaiseType.ETH)] = investorInvested[_beneficiary][uint8(FundRaiseType.ETH)]+(spentValue);
        fundsRaised[uint8(FundRaiseType.ETH)] = fundsRaised[uint8(FundRaiseType.ETH)]+(spentValue);
        // Forward ETH to issuer wallet
        wallet.transfer(spentValue);
        // Refund excess ETH to investor wallet
        payable(msg.sender).transfer(msg.value-(spentValue));
        emit FundsReceived(msg.sender, _beneficiary, spentUSD, FundRaiseType.ETH, msg.value, spentValue, rate);
        return (spentUSD, spentValue, getTokensMinted()-(initialMinted));
    }

    /**
      * @notice Purchase tokens using POLY
      * @param _beneficiary Address where security tokens will be sent
      * @param _investedPOLY Amount of POLY invested
      * @param _minTokens Minumum number of tokens to buy or else revert
      */
    function buyWithPOLYRateLimited(address _beneficiary, uint256 _investedPOLY, uint256 _minTokens) public validPOLY returns (uint256, uint256, uint256) {
        return _buyWithTokens(_beneficiary, _investedPOLY, FundRaiseType.POLY, _minTokens, polyToken);
    }

    /**
      * @notice Purchase tokens using Stable coins
      * @param _beneficiary Address where security tokens will be sent
      * @param _investedSC Amount of Stable coins invested
      * @param _minTokens Minumum number of tokens to buy or else revert
      * @param _usdToken Address of USD stable coin to buy tokens with
      */
    function buyWithUSDRateLimited(address _beneficiary, uint256 _investedSC, uint256 _minTokens, IERC20 _usdToken)
        public validSC(address(_usdToken)) returns (uint256, uint256, uint256)
    {
        return _buyWithTokens(_beneficiary, _investedSC, FundRaiseType.SC, _minTokens, _usdToken);
    }

    function _buyWithTokens(address _beneficiary, uint256 _tokenAmount, FundRaiseType _fundRaiseType, uint256 _minTokens, IERC20 _token) internal returns (uint256, uint256, uint256) {
        (uint256 rate, uint256 spentUSD, uint256 spentValue, uint256 initialMinted) = _getSpentvalues(_beneficiary, _tokenAmount, _fundRaiseType, _minTokens);
        // Modify storage
        investorInvested[_beneficiary][uint8(_fundRaiseType)] = investorInvested[_beneficiary][uint8(_fundRaiseType)]+(spentValue);
        fundsRaised[uint8(_fundRaiseType)] = fundsRaised[uint8(_fundRaiseType)]+(spentValue);
        if(address(_token) != address(polyToken))
            stableCoinsRaised[address(_token)] = stableCoinsRaised[address(_token)]+(spentValue);
        // Forward coins to issuer wallet
        require(_token.transferFrom(msg.sender, wallet, spentValue), "Transfer failed");
        emit FundsReceived(msg.sender, _beneficiary, spentUSD, _fundRaiseType, _tokenAmount, spentValue, rate);
        return (spentUSD, spentValue, getTokensMinted()-(initialMinted));
    }

    function _getSpentvalues(address _beneficiary, uint256 _amount, FundRaiseType _fundRaiseType, uint256 _minTokens) internal returns(uint256 rate, uint256 spentUSD, uint256 spentValue, uint256 initialMinted) {
        initialMinted = getTokensMinted();
        rate = getRate(_fundRaiseType);
        (spentUSD, spentValue) = _buyTokens(_beneficiary, _amount, rate, _fundRaiseType);
        require(getTokensMinted()-(initialMinted) >= _minTokens, "Insufficient minted");
    }


    /**
      * @notice Low level token purchase
      * @param _beneficiary Address where security tokens will be sent
      * @param _investmentValue Amount of POLY, ETH or Stable coins invested
      * @param _fundRaiseType Fund raise type (POLY, ETH, SC)
      */
    function _buyTokens(
        address _beneficiary,
        uint256 _investmentValue,
        uint256 _rate,
        FundRaiseType _fundRaiseType
    )
        internal
        whenNotPaused
        returns(uint256 spentUSD, uint256 spentValue)
    {
        if (!allowBeneficialInvestments) {
            require(_beneficiary == msg.sender, "Beneficiary != funder");
        }

        require(_canBuy(_beneficiary), "Unauthorized");

        uint256 originalUSD = DecimalMath.mul(_rate, _investmentValue);
        uint256 allowedUSD = _buyTokensChecks(_beneficiary, _investmentValue, originalUSD);

        for (uint256 i = currentTier; i < tiers.length; i++) {
            bool gotoNextTier;
            uint256 tempSpentUSD;
            // Update current tier if needed
            if (currentTier != i)
                currentTier = i;
            // If there are tokens remaining, process investment
            if (tiers[i].mintedTotal < tiers[i].tokenTotal) {
                (tempSpentUSD, gotoNextTier) = _calculateTier(_beneficiary, i, allowedUSD-(spentUSD), _fundRaiseType);
                spentUSD = spentUSD+(tempSpentUSD);
                // If all funds have been spent, exit the loop
                if (!gotoNextTier)
                    break;
            }
        }

        // Modify storage
        if (spentUSD > 0) {
            if (investorInvestedUSD[_beneficiary] == 0)
                investorCount = investorCount + 1;
            investorInvestedUSD[_beneficiary] = investorInvestedUSD[_beneficiary]+(spentUSD);
            fundsRaisedUSD = fundsRaisedUSD+(spentUSD);
        }

        spentValue = DecimalMath.div(spentUSD, _rate);
    }

    function _buyTokensChecks(
        address _beneficiary,
        uint256 _investmentValue,
        uint256 investedUSD
    )
        internal
        view
        returns(uint256 netInvestedUSD)
    {
        require(isOpen(), "STO not open");
        require(_investmentValue > 0, "No funds sent");

        // Check for minimum investment
        require(investedUSD+(investorInvestedUSD[_beneficiary]) >= minimumInvestmentUSD, "Investment < min");
        netInvestedUSD = investedUSD;
        // Check for non-accredited cap
        if (!_isAccredited(_beneficiary)) {
            uint256 investorLimitUSD = (nonAccreditedLimitUSDOverride[_beneficiary] == 0) ? nonAccreditedLimitUSD : nonAccreditedLimitUSDOverride[_beneficiary];
            require(investorInvestedUSD[_beneficiary] < investorLimitUSD, "Over Non-accredited investor limit");
            if (investedUSD+(investorInvestedUSD[_beneficiary]) > investorLimitUSD)
                netInvestedUSD = investorLimitUSD-(investorInvestedUSD[_beneficiary]);
        }
    }

    function _calculateTier(
        address _beneficiary,
        uint256 _tier,
        uint256 _investedUSD,
        FundRaiseType _fundRaiseType
    )
        internal
        returns(uint256 spentUSD, bool gotoNextTier)
     {
        // First purchase any discounted tokens if POLY investment
        uint256 tierSpentUSD;
        uint256 tierPurchasedTokens;
        uint256 investedUSD = _investedUSD;
        Tier storage tierData = tiers[_tier];
        // Check whether there are any remaining discounted tokens
        if ((_fundRaiseType == FundRaiseType.POLY) && (tierData.tokensDiscountPoly > tierData.mintedDiscountPoly)) {
            uint256 discountRemaining = tierData.tokensDiscountPoly-(tierData.mintedDiscountPoly);
            uint256 totalRemaining = tierData.tokenTotal-(tierData.mintedTotal);
            if (totalRemaining < discountRemaining)
                (spentUSD, tierPurchasedTokens, gotoNextTier) = _purchaseTier(_beneficiary, tierData.rateDiscountPoly, totalRemaining, investedUSD, _tier);
            else
                (spentUSD, tierPurchasedTokens, gotoNextTier) = _purchaseTier(_beneficiary, tierData.rateDiscountPoly, discountRemaining, investedUSD, _tier);
            investedUSD = investedUSD-(spentUSD);
            tierData.mintedDiscountPoly = tierData.mintedDiscountPoly+(tierPurchasedTokens);
            tierData.minted[uint8(_fundRaiseType)] = tierData.minted[uint8(_fundRaiseType)]+(tierPurchasedTokens);
            tierData.mintedTotal = tierData.mintedTotal+(tierPurchasedTokens);
        }
        // Now, if there is any remaining USD to be invested, purchase at non-discounted rate
        if (investedUSD > 0 &&
            tierData.tokenTotal-(tierData.mintedTotal) > 0 &&
            (_fundRaiseType != FundRaiseType.POLY || tierData.tokensDiscountPoly <= tierData.mintedDiscountPoly)
        ) {
            (tierSpentUSD, tierPurchasedTokens, gotoNextTier) = _purchaseTier(_beneficiary, tierData.rate, tierData.tokenTotal-(tierData.mintedTotal), investedUSD, _tier);
            spentUSD = spentUSD+(tierSpentUSD);
            tierData.minted[uint8(_fundRaiseType)] = tierData.minted[uint8(_fundRaiseType)]+(tierPurchasedTokens);
            tierData.mintedTotal = tierData.mintedTotal+(tierPurchasedTokens);
        }
    }

    function _purchaseTier(
        address _beneficiary,
        uint256 _tierPrice,
        uint256 _tierRemaining,
        uint256 _investedUSD,
        uint256 _tier
    )
        internal
        returns(uint256 spentUSD, uint256 purchasedTokens, bool gotoNextTier)
    {
        purchasedTokens = DecimalMath.div(_investedUSD, _tierPrice);
        uint256 granularity = securityToken.granularity();

        if (purchasedTokens > _tierRemaining) {
            purchasedTokens = _tierRemaining/(granularity);
            gotoNextTier = true;
        } else {
            purchasedTokens = purchasedTokens/(granularity);
        }

        purchasedTokens = purchasedTokens*(granularity);
        spentUSD = DecimalMath.mul(purchasedTokens, _tierPrice);

        // In case of rounding issues, ensure that spentUSD is never more than investedUSD
        if (spentUSD > _investedUSD) {
            spentUSD = _investedUSD;
        }

        if (purchasedTokens > 0) {
            securityToken.issue(_beneficiary, purchasedTokens, "");
            emit TokenPurchase(msg.sender, _beneficiary, purchasedTokens, spentUSD, _tierPrice, _tier);
        }
    }

    function _isAccredited(address _investor) internal view returns(bool) {
        IDataStore dataStore = getDataStore();
        return _getIsAccredited(_investor, dataStore);
    }

    function _getIsAccredited(address _investor, IDataStore dataStore) internal view returns(bool) {
        uint256 flags = dataStore.getUint256(_getKey(INVESTORFLAGS, _investor));
        uint256 flag = flags & uint256(1); //isAccredited is flag 0 so we don't need to bit shift flags.
        return flag > 0 ? true : false;
    }

    /////////////
    // Getters //
    /////////////

    /**
     * @notice This function returns whether or not the STO is in fundraising mode (open)
     *  bool Whether the STO is accepting investments
     */
    function isOpen() public view returns(bool) {
        /*solium-disable-next-line security/no-block-members*/
        if (isFinalized || block.timestamp < startTime || block.timestamp >= endTime || capReached())
            return false;
        return true;
    }

    /**
     * @notice Checks whether the cap has been reached.
     *  bool Whether the cap was reached
     */
    function capReached() public view returns (bool) {
        if (isFinalized) {
            return (finalAmountReturned == 0);
        }
        return (tiers[tiers.length - 1].mintedTotal == tiers[tiers.length - 1].tokenTotal);
    }

    /**
     * @dev returns current conversion rate of funds
     * @param _fundRaiseType Fund raise type to get rate of
     */
    function getRate(FundRaiseType _fundRaiseType) public returns (uint256) {
        if (_fundRaiseType == FundRaiseType.ETH) {
            return IOracle(_getOracle(bytes32("ETH"), bytes32("USD"))).getPrice();
        } else if (_fundRaiseType == FundRaiseType.POLY) {
            return IOracle(_getOracle(bytes32("POLY"), bytes32("USD"))).getPrice();
        } else if (_fundRaiseType == FundRaiseType.SC) {
            return 10**18;
        }
    }

    /**
     * @notice This function converts from ETH or POLY to USD
     * @param _fundRaiseType Currency key
     * @param _amount Value to convert to USD
     *  uint256 Value in USD
     */
    function convertToUSD(FundRaiseType _fundRaiseType, uint256 _amount) public returns(uint256) {
        return DecimalMath.mul(_amount, getRate(_fundRaiseType));
    }

    /**
     * @notice This function converts from USD to ETH or POLY
     * @param _fundRaiseType Currency key
     * @param _amount Value to convert from USD
     *  uint256 Value in ETH or POLY
     */
    function convertFromUSD(FundRaiseType _fundRaiseType, uint256 _amount) public returns(uint256) {
        return DecimalMath.div(_amount, getRate(_fundRaiseType));
    }

    /**
     * @notice Return the total no. of tokens sold
     *  uint256 Total number of tokens sold
     */
    function getTokensSold() public override view returns (uint256) {
        if (isFinalized)
            return totalTokensSold;
        return getTokensMinted();
    }

    /**
     * @notice Return the total no. of tokens minted
     *  uint256 Total number of tokens minted
     */
    function getTokensMinted() public view returns (uint256 tokensMinted) {
        for (uint256 i = 0; i < tiers.length; i++) {
            tokensMinted = tokensMinted+(tiers[i].mintedTotal);
        }
    }

    /**
     * @notice Return the total no. of tokens sold for the given fund raise type
     * param _fundRaiseType The fund raising currency (e.g. ETH, POLY, SC) to calculate sold tokens for
     *  uint256 Total number of tokens sold for ETH
     */
    function getTokensSoldFor(FundRaiseType _fundRaiseType) external view returns (uint256 tokensSold) {
        for (uint256 i = 0; i < tiers.length; i++) {
            tokensSold = tokensSold+(tiers[i].minted[uint8(_fundRaiseType)]);
        }
    }

    /**
     * @notice Return array of minted tokens in each fund raise type for given tier
     * param _tier The tier to return minted tokens for
     *  uint256[] array of minted tokens in each fund raise type
     */
    function getTokensMintedByTier(uint256 _tier) external view returns(uint256[] memory) {
        uint256[] memory tokensMinted = new uint256[](3);
        tokensMinted[0] = tiers[_tier].minted[uint8(FundRaiseType.ETH)];
        tokensMinted[1] = tiers[_tier].minted[uint8(FundRaiseType.POLY)];
        tokensMinted[2] = tiers[_tier].minted[uint8(FundRaiseType.SC)];
        return tokensMinted;
    }

    /**
     * @notice Return the total no. of tokens sold in a given tier
     * param _tier The tier to calculate sold tokens for
     *  uint256 Total number of tokens sold in the tier
     */
    function getTokensSoldByTier(uint256 _tier) external view returns (uint256) {
        uint256 tokensSold;
        tokensSold = tokensSold+(tiers[_tier].minted[uint8(FundRaiseType.ETH)]);
        tokensSold = tokensSold+(tiers[_tier].minted[uint8(FundRaiseType.POLY)]);
        tokensSold = tokensSold+(tiers[_tier].minted[uint8(FundRaiseType.SC)]);
        return tokensSold;
    }

    /**
     * @notice Return the total no. of tiers
     *  uint256 Total number of tiers
     */
    function getNumberOfTiers() external view returns (uint256) {
        return tiers.length;
    }

    /**
     * @notice Return the usd tokens accepted by the STO
     *  address[] usd tokens
     */
    function getUsdTokens() external view returns (IERC20[] memory) {
        return usdTokens;
    }

    /**
     * @notice Return the permissions flag that are associated with STO
     */
    function getPermissions() public view returns(bytes32[] memory allPermissions) {
        allPermissions = new bytes32[](2);
        allPermissions[0] = OPERATOR;
        allPermissions[1] = ADMIN;
        return allPermissions;
    }

    /**
     * @notice Return the STO details
     *  Unixtimestamp at which offering gets start.
     *  Unixtimestamp at which offering ends.
     *  Currently active tier
     *  Array of Number of tokens this STO will be allowed to sell at different tiers.
     *  Array Rate at which tokens are sold at different tiers
     *  Amount of funds raised
     *  Number of individual investors this STO have.
     *  Amount of tokens sold.
     *  Array of bools to show if funding is allowed in ETH, POLY, SC respectively
     */
    function getSTODetails() external view returns(uint256, uint256, uint256, uint256[] memory, uint256[] memory, uint256, uint256, uint256, bool[] memory) {
        uint256[] memory cap = new uint256[](tiers.length);
        uint256[] memory rate = new uint256[](tiers.length);
        for(uint256 i = 0; i < tiers.length; i++) {
            cap[i] = tiers[i].tokenTotal;
            rate[i] = tiers[i].rate;
        }
        bool[] memory _fundRaiseTypes = new bool[](3);
        _fundRaiseTypes[0] = fundRaiseTypes[uint8(FundRaiseType.ETH)];
        _fundRaiseTypes[1] = fundRaiseTypes[uint8(FundRaiseType.POLY)];
        _fundRaiseTypes[2] = fundRaiseTypes[uint8(FundRaiseType.SC)];
        return (
            startTime,
            endTime,
            currentTier,
            cap,
            rate,
            fundsRaisedUSD,
            investorCount,
            getTokensSold(),
            _fundRaiseTypes
        );
    }

    /**
     * @notice This function returns the signature of configure function
     *  bytes4 Configure function signature
     */
    function getInitFunction() public pure returns(bytes4) {
        return this.configure.selector;
    }

    function _getOracle(bytes32 _currency, bytes32 _denominatedCurrency) internal view returns(address oracleAddress) {
        oracleAddress = customOracles[_currency][_denominatedCurrency];
        if (oracleAddress == address(0))
            oracleAddress =  IPolymathRegistry(securityToken.polymathRegistry()).getAddress(oracleKeys[_currency][_denominatedCurrency]);
    }
}