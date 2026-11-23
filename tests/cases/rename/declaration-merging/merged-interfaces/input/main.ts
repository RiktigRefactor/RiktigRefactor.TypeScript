interface /*|*/Box {
    width: number;
}

interface Box {
    height: number;
}

const box: Box = { width: 2, height: 3 };
if (box.width * box.height !== 6) throw new Error("area");
