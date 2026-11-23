import { Pricing } from "./pricing";

export class Order {
    static label() {
        return Pricing.taxName + Pricing.separator;
    }
}
