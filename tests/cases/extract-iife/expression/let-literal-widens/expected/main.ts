function toggle(on: boolean) {
    let mode = ((): string => "on")();
    if (!on) mode = "off";
    return mode;
}

if (toggle(false) !== "off") throw new Error("toggle");
