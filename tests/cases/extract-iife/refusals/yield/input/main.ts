function* numbers() {
    /*[*/yield 1;/*]*/
    yield 2;
}

if ([...numbers()].join() !== "1,2") throw new Error("numbers");
