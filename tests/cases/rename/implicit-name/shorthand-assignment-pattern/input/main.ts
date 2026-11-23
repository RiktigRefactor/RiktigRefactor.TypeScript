let /*|*/size = 0;
({ size } = { size: 4, count: 9 } as { size: number; count: number });

if (size !== 4) throw new Error(String(size));
