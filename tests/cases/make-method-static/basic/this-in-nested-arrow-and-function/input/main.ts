class Basket {
    items = [1, 2, 3];
    factor = 10;

    /*|*/scaled(): number[] {
        const own = function (this: { factor: number }) {
            return this.factor;
        }.call({ factor: 1 });
        return this.items.map((item) => item * this.factor * own);
    }
}

const basket = new Basket();
if (basket.scaled().join() !== "10,20,30") throw new Error(basket.scaled().join());
