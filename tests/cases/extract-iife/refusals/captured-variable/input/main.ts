function run() {
    let n = 0;
    const bump = () => {
        n++;
    };
    const seen = /*[*/(bump(), n)/*]*/;
    return seen;
}

if (run() !== 1) throw new Error(String(run()));
