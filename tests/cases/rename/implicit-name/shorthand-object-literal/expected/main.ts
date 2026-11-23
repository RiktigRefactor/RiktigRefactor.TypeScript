const amount = 5;
const record = { total: amount };

if (Object.keys(record).join() !== "total") throw new Error(Object.keys(record).join());
if (record.total !== 5) throw new Error("value");
