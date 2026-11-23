function mode(prefix: string) {
    const state = /*[*/"on"/*]*/;
    const exact: "on" = state;
    return prefix + exact;
}

if (mode(">") !== ">on") throw new Error("mode");
