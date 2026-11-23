interface Tag {
    /*|*/kind: string;
}

const tag: Tag = { kind: "a" };
const { kind } = tag;
if (tag.kind + kind !== "aa") throw new Error("kind");
