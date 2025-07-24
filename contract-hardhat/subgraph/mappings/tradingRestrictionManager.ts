import { MerkleRoot as MerkleRootSchema } from "../../generated/schema";
import { MerkleRootUpdated as MerkleRootUpdatedEvent } from "../../generated/TradingRestrictionManager/TradingRestrictionManager";

export function handleMerkleRootUpdated(
  event: MerkleRootUpdatedEvent
): void {
  const id = event.transaction.hash.toHex();
  let entity = MerkleRootSchema.load(id);

  if (entity == null) {
    entity = new MerkleRootSchema(id);
  }

  entity.id = id;
  entity.creator = event.transaction.from;
  entity.timestamp = event.block.timestamp;
  entity.root = event.params.root;

  entity.save()
}