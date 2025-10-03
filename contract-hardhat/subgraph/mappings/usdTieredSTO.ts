import { Address, Bytes, log, BigInt } from "@graphprotocol/graph-ts";
import { STOState, TokenPurchase as TokenPurchaseSchema, PaymentToken as PaymentTokenSchema } from "../../generated/schema"
import { TokenPurchase, SetAddresses } from "../../generated/templates/USDTieredSTO/USDTieredSTO"
import { ERC20 } from "../../generated/templates/USDTieredSTO/ERC20"


export function handleTokenPurchase(event: TokenPurchase): void {
  const id = event.transaction.hash.toHex();

  let entity = TokenPurchaseSchema.load(id)

  if (!entity) {
    entity = new TokenPurchaseSchema(id)
  }

  const paymentTokenSchema = PaymentTokenSchema.load(event.address.toHex()); // Payment token already stored when STO was created
  
  if (paymentTokenSchema == null) {
    // Optionally log a warning and return
    log.warning("No PaymentTokenSchema found for tx: {}", [id]);
    return;
  }

  let tierIndex = event.params._tier.toI32();
  let paymentTokenAddress = paymentTokenSchema.tokens[tierIndex];
  
  const paymentTokenContract = ERC20.bind(Address.fromBytes(paymentTokenAddress));

  entity.purchaser = event.params._purchaser;
  entity.beneficiary = event.params._beneficiary;
  entity.tokens = event.params._tokens;
  entity.usdAmount = event.params._usdAmount;
  entity.tierPrice = event.params._tierPrice;
  entity.tier = event.params._tier;
  entity.contractAddress = event.address;
  entity.paymentTokenDecimal = BigInt.fromI32(paymentTokenContract.decimals());
  entity.timestamp = event.block.timestamp;

  entity.save()

  let sto = STOState.load(event.address.toHex());
  if (!sto) {
    sto = new STOState(event.address.toHex());
    sto.tokensSold = event.params._tokens;
    sto.finalized = false;
  } else {
    sto.tokensSold = sto.tokensSold.plus(event.params._tokens);
  }
  sto.save();
}

export function handleSetAddresses(event: SetAddresses): void {
  const id = event.address.toHex();
  let entity = PaymentTokenSchema.load(id);

  if (!entity) {
    entity = new PaymentTokenSchema(id);
    entity.sender = event.transaction.from;
    entity.stoAddress = event.address;
    
    // Convert address[] -> Bytes[]
    entity.tokens = event.params._usdTokens.map<Bytes>((addr: Address) => addr as Bytes);

    entity.wallet = event.params._wallet;
    entity.timestamp = event.block.timestamp;
  }

  entity.save();
}



