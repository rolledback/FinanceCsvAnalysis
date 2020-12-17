export type RawActivity = {
    date: string,
    amount: number,
    file: string,
    description: string
};

export type Activity = {
    type: string,
    description: string,
    amount: number,
    date: Date,
    file: string,
    metadata: any
};

export type RuleResult = {
    type: string,
    metadata: { [key: string]: string | number }
};

export type Rule = {
    title: string,
    descriptionRegex: string,
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

export type ReportCriteria = {
    type?: string;
    isPositive?: boolean;
};

export type SumReport = {
    type: "Sum",
    title: string
    criteria: ReportCriteria
};

export type PrintReport = {
    type: "Print",
    title: string
    criteria: ReportCriteria
};

export type Report = SumReport | PrintReport;
