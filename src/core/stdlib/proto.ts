import type { Ranty } from "../ranty";
import { getMapPrototype, setMapPrototype } from "../map-proto";
import { addBuiltin, argAt, asMap, expectArgCount } from "./shared";

export function loadProtoStdlib(context: Ranty): void {
  addBuiltin(context, "proto", (...args) => {
    expectArgCount("proto", args, 1);
    const map = asMap(argAt(args, 0), "proto");
    return getMapPrototype(map);
  });

  addBuiltin(context, "set-proto", (...args) => {
    expectArgCount("set-proto", args, 2);
    const map = asMap(argAt(args, 0), "set-proto");
    const protoArg = argAt(args, 1);
    const proto = protoArg == null ? null : asMap(protoArg, "set-proto");
    setMapPrototype(map, proto);
    return "";
  });
}
