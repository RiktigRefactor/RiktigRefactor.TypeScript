interface Account {
    nickname?: string;
}

class Account {
    constructor(public name: string) {}
}

const user = new Account("ana");
user.nickname = "a";
if (user.name + user.nickname !== "anaa") throw new Error("user");
