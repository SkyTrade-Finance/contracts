// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPermit2.sol";

/// @title MockPermit2
/// @notice Minimal mock of Uniswap's Permit2 for local testing/coverage.
///         It ignores signatures and simply pulls tokens from the owner
///         using standard ERC20 allowances.
contract MockPermit2 is IPermit2 {
    // Optional storage for nonce bitmap to satisfy interface
    mapping(address => mapping(uint256 => uint256)) private _nonceBitmap;

    function DOMAIN_SEPARATOR() external pure returns (bytes32) {
        return bytes32(0);
    }

    function nonceBitmap(address owner, uint256 wordPos) external view returns (uint256) {
        return _nonceBitmap[owner][wordPos];
    }

    function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external {
        _nonceBitmap[msg.sender][wordPos] |= mask;
        emit UnorderedNonceInvalidation(msg.sender, wordPos, mask);
    }

    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external {
        // Pull tokens using standard allowance. Assumes owner has approved this contract.
        require(
            IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount),
            "MockPermit2: transfer failed"
        );
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 /* witness */,
        string calldata /* witnessTypeString */,
        bytes calldata /* signature */
    ) external {
        require(
            IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount),
            "MockPermit2: transfer failed"
        );
    }

    function permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external {
        uint256 len = permit.permitted.length;
        require(len == transferDetails.length, "MockPermit2: length mismatch");
        for (uint256 i = 0; i < len; i++) {
            require(
                IERC20(permit.permitted[i].token).transferFrom(owner, transferDetails[i].to, transferDetails[i].requestedAmount),
                "MockPermit2: transfer failed"
            );
        }
    }

    function permitWitnessTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes32 /* witness */,
        string calldata /* witnessTypeString */,
        bytes calldata /* signature */
    ) external {
        uint256 len = permit.permitted.length;
        require(len == transferDetails.length, "MockPermit2: length mismatch");
        for (uint256 i = 0; i < len; i++) {
            require(
                IERC20(permit.permitted[i].token).transferFrom(owner, transferDetails[i].to, transferDetails[i].requestedAmount),
                "MockPermit2: transfer failed"
            );
        }
    }
}


