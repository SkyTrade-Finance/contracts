import { STOState, TokenPurchase as TokenPurchaseSchema } from "../../generated/schema"
import { TokenPurchase } from "../../generated/templates/USDTieredSTO/USDTieredSTO"


export function handleTokenPurchase(event: TokenPurchase): void {
  const id = event.transaction.hash.toHex();

  let entity = TokenPurchaseSchema.load(id)

  if (!entity) {
    entity = new TokenPurchaseSchema(id)
  }

  entity.purchaser = event.params._purchaser;
  entity.beneficiary = event.params._beneficiary;
  entity.tokens = event.params._tokens;
  entity.usdAmount = event.params._usdAmount;
  entity.tierPrice = event.params._tierPrice;
  entity.tier = event.params._tier;
  entity.contractAddress = event.address;
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



