function run() {
    let count = 0;
    /*[*/count++;
    const label = `#${count}`;/*]*/
    return label + count;
}

if (run() !== "#11") throw new Error(run());
