interface Tag {
    class: string;
}

const tag: Tag = { class: "a" };
const { class: kind } = tag;
if (tag.class + kind !== "aa") throw new Error("kind");
