const amount = 1;
const settings = { total: 2 };
if (!("total" in settings) || amount !== 1) throw new Error("mismatch");
