function format(value: number): string {
    return `${format.prefix}${value}`;
}

namespace format {
    export const prefix = "#";
}

if (format(5) !== "#5") throw new Error(format(5));
