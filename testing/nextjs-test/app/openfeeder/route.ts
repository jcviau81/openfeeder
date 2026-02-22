import { createOpenFeederHandler } from "../../lib/openfeeder";
import config from "../../openfeeder.config";

export const { GET } = createOpenFeederHandler(config);
