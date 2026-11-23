interface Node {
    next?: { label: string };
}

function label(node: Node) {
    return /*[*/node.next?.label/*]*/.length;
}

if (label({}) !== undefined || label({ next: { label: "ab" } }) !== 2) throw new Error("label");
