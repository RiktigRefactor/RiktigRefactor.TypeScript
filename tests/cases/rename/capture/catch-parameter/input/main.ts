const /*|*/fallback = "fallback";
let caught = "";
try {
    throw "thrown";
} catch (error) {
    caught = `${error}/${fallback}`;
}

if (caught !== "thrown/fallback") throw new Error(caught);
