// 连接器注册入口：应用启动时调用 registerAll()
// 注册 6 个已实现连接器 + 14 个占位连接器
import { registerConnector, registerPlaceholder } from "./registry.js";
import { ALL_SPECS, placeholderSpecs } from "./catalog.js";
import { KingdeeEasOpenApiConnector } from "./kingdee-eas-openapi.js";
import { SapODataConnector } from "./sap-odata.js";
import { JdbcMysqlConnector } from "./jdbc-mysql.js";
import { CdcMysqlConnector } from "./cdc-mysql.js";
import { TreasurySysConnector } from "./treasury-sys.js";
import { FileCsvConnector } from "./file-csv.js";

let registered = false;

export function registerAllConnectors(): void {
  if (registered) return;
  // 6 个实现
  registerConnector(new KingdeeEasOpenApiConnector());
  registerConnector(new SapODataConnector());
  registerConnector(new JdbcMysqlConnector());
  registerConnector(new CdcMysqlConnector());
  registerConnector(new TreasurySysConnector());
  registerConnector(new FileCsvConnector());
  // 14 个占位
  for (const spec of placeholderSpecs) {
    registerPlaceholder(spec);
  }
  registered = true;
}

export { ALL_SPECS };
export * from "./registry.js";
export * from "./types.js";
