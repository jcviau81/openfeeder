import { createOpenFeederDiscoveryHandler } from "../../../lib/openfeeder";
import config from "../../../openfeeder.config";

export const { GET } = createOpenFeederDiscoveryHandler(config);
