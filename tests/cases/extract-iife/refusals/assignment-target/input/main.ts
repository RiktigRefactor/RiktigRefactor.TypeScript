function set() {
    const box = { value: 0 };
    /*[*/box.value/*]*/ = 5;
    return box.value;
}

if (set() !== 5) throw new Error("set");
