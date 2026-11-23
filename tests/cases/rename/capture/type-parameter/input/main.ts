type /*|*/Label = string;

function describe<T>(value: T, label: Label): string {
    return `${label}: ${String(value)}`;
}

if (describe("a", "one") !== "one: a") throw new Error("describe");
