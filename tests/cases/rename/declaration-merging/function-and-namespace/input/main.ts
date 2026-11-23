function /*|*/show(value: number): string {
    return `${show.prefix}${value}`;
}

namespace show {
    export const prefix = "#";
}

if (show(5) !== "#5") throw new Error(show(5));
