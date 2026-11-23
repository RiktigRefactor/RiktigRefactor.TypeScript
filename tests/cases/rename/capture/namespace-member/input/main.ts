const /*|*/defaultRate = 2;

namespace Pricing {
    export const rate = 3;
    export function price(amount: number) {
        return amount * defaultRate;
    }
}

if (Pricing.price(5) !== 10) throw new Error("price");
