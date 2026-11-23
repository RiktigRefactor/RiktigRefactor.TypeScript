const /*|*/total = 1;
const settings = { total: 2 };
if (!("total" in settings) || total !== 1) throw new Error("mismatch");
