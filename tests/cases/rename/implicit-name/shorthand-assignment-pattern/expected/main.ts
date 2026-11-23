let count = 0;
({ size: count } = { size: 4, count: 9 } as { size: number; count: number });

if (count !== 4) throw new Error(String(count));
