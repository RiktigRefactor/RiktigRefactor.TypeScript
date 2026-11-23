import { rate } from "./other";
import { taxRate } from "./tax";

if (taxRate + rate !== 1.25) throw new Error("rate");
