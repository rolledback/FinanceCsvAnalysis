export type RawActivity = {
    date: string,
    amount: number,
    file: string,
    description: string
};

export type Activity = {
    date: Date,
    amount: number,
    file: string,
    metadata: any,
    categories: string[]
    type: string,
    description: string,
};

export type RuleResult = {
    type: string,
    categories?: string[],
    metadata?: { [key: string]: string | number }
};

export type Imports = string[];

export type Rule = {
    title: string,
    descriptionRegex: string | string[],
    result: RuleResult
};

export type CancelOutAction = {
    type: "CancelOut",
    title: string,
    criteria: {
        aType: string,
        bType: string,
        matchOn: string
    }
};

export type Action = CancelOutAction;
