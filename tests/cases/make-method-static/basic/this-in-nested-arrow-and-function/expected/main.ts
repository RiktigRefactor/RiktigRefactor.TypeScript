class Basket {
    items = [1, 2, 3];
    factor = 10;

    static scaled(basket: Basket): number[] {
        const own = function (this: { factor: number }) {
            return this.factor;
        }.call({ factor: 1 });
        return basket.items.map((item) => item * basket.factor * own);
    }
}

const basket = new Basket();
if (Basket.scaled(basket).join() !== "10,20,30") throw new Error(Basket.scaled(basket).join());
