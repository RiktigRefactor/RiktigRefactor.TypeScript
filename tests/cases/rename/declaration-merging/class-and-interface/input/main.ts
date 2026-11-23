interface User {
    nickname?: string;
}

class /*|*/User {
    constructor(public name: string) {}
}

const user = new User("ana");
user.nickname = "a";
if (user.name + user.nickname !== "anaa") throw new Error("user");
