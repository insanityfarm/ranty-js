import type { Ranty } from "../ranty";
import { loadAssertionStdlib } from "./assertion";
import { loadBlockStdlib } from "./block";
import { loadBooleanStdlib } from "./boolean";
import { loadCollectionsStdlib } from "./collections";
import { loadCompareStdlib } from "./compare";
import { loadConvertStdlib } from "./convert";
import { loadFormatStdlib } from "./format";
import { loadGeneralStdlib } from "./general";
import { loadGenerateStdlib } from "./generate";
import { loadMathStdlib } from "./math";
import { loadProtoStdlib } from "./proto";
import { loadStringsStdlib } from "./strings";
import { loadVerifyStdlib } from "./verify";

export function loadStdlib(context: Ranty): void {
  loadGeneralStdlib(context);
  loadAssertionStdlib(context);
  loadFormatStdlib(context);
  loadBlockStdlib(context);
  loadBooleanStdlib(context);
  loadCompareStdlib(context);
  loadVerifyStdlib(context);
  loadMathStdlib(context);
  loadConvertStdlib(context);
  loadGenerateStdlib(context);
  loadProtoStdlib(context);
  loadCollectionsStdlib(context);
  loadStringsStdlib(context);
}
