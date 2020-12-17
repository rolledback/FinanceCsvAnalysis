import * as process from "process";
import * as fs from "fs";
import * as path from "path";

import {
    RawActivity,
    Activity,
    Rule,
    Action,
    ReportCriteria,
    Report,
    SumReport,
    PrintReport,
    CancelOutAction,
} from "./types";

const defaultParsingRule: Rule = {
    "title": "Other",
    "descriptionRegex": ".*",
    "result": {
        "type": "Other",
        "metadata": {}
    }
};

const argv = process.argv.slice(2);
const targetDir = argv[0];
if (!targetDir) {
    throw new Error("No target directory specified.");
}

export function readConfigFile(): { rules: Rule[], actions: Action[], reports: Report[] } {
    let configFile = path.join(targetDir, "config.json");

    if (!fs.existsSync(configFile)) {
        throw new Error(`Target directory ${targetDir} must contain a config.json file.`);
    }

    let configFileParsed = (JSON.parse(fs.readFileSync(configFile).toString()));

    return {
        rules: configFileParsed.rules,
        actions: configFileParsed.actions,
        reports: configFileParsed.reports
    };
}

export function getFilesToAnalyze(): string[] {
    let filesToAnalyze = fs.readdirSync(targetDir)
        .map((p) => path.join(targetDir, p))
        .filter((p) => fs.statSync(p).isFile())
        .filter((p) => path.extname(p) === ".csv")

    if (filesToAnalyze.length === 0) {
        throw new Error(`Target directory ${targetDir} must contain at least one .csv file.`);
    }

    return filesToAnalyze;
}

export function parseFilesToRawActivities(files: string[]): RawActivity[] {
    return files.reduce<RawActivity[]>((pV, file) => {
        pV.push(...parseFileToRawActivities(file));
        return pV;
    }, []);
}

export function applyRulesToRawActivities(rules: Rule[], rawActivities: RawActivity[]): Activity[] {
    return rawActivities.map<Activity | undefined>((rawActivity) => applyRulesToRawActivity(rules, rawActivity));
}

export function sortActivitesByDate(activities: Activity[]): Activity[] {
    return activities.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function executeActionsOnActivities(actions: Action[], activities: Activity[]): Activity[] {
    activities = activities.slice();
    actions.forEach((action) => {
        if (action.type === "CancelOut") {
            executeCancelOutActionOnActivities(action, activities);
        }
    });
    return activities;
}

export function writeReports(reports: Report[], activities: Activity[]) {
    let reportsFile = path.join(targetDir, "reports.txt");
    fs.writeFileSync(reportsFile, "");
    reports.forEach((report) => writeReport(reportsFile, report, activities));
}

function parseFileToRawActivities(file: string): RawActivity[] {
    const dateColumn = 0;
    const amountColumn = 1;
    const descriptionColumn = 2;
    return fs.readFileSync(file)
        .toString()
        .split(/\r?\n/)
        .filter((line) => !!line)
        .map<RawActivity>((line) => {
            let lineSplit = line.split(",");
            return {
                date: extractRowValue(lineSplit, dateColumn),
                amount: Number.parseFloat(extractRowValue(lineSplit, amountColumn)),
                file: path.basename(file),
                description: extractRowValue(lineSplit, descriptionColumn)
            };
        });
}

function extractRowValue(row: string[], idx: number): string {
    let rowValue = row[idx];
    if (rowValue[0] === "\"" && rowValue[rowValue.length] === "\"") {
        rowValue = rowValue.slice(1, -1);
    }

    return rowValue;
}

function applyRulesToRawActivity(rules: Rule[], rawActivity: RawActivity): Activity {
    for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        if (doesRuleApply(rule, rawActivity)) {
            console.log(`Applying rule '${rule.title}' to ${JSON.stringify(rawActivity)}`);
            return applyRule(rule, rawActivity);
        }
    }

    console.log(`Applying default rule to ${JSON.stringify(rawActivity)}`);
    return applyRule(defaultParsingRule, rawActivity);
}

function doesRuleApply(rule: Rule, rawActivity: RawActivity): boolean {
    let predicates: ((rawActivity: RawActivity) => boolean)[] = [];
    predicates.push((rawActivity: RawActivity) => new RegExp(rule.descriptionRegex).test(rawActivity.description));
    return predicates.reduce<boolean>((pV, predicate) => pV && predicate(rawActivity), true);
}

function applyRule(rule: Rule, rawActivity: RawActivity): Activity {
    let descriptionRegexExec = new RegExp(rule.descriptionRegex).exec(rawActivity.description);
    return {
        type: rule.result.type,
        description: rawActivity.description,
        amount: rawActivity.amount,
        date: new Date(rawActivity.date),
        file: rawActivity.file,
        metadata: Object.keys(rule.result.metadata)
            .reduce<{}>((pV, cV) => {
                let value = rule.result.metadata[cV];
                if (typeof value === "string") {
                    if (value === "<file>") {
                        pV[cV] = rawActivity.file;
                    } else {
                        pV[cV] = value;
                    }
                } else {
                    pV[cV] = descriptionRegexExec[value];
                }
                return pV;
            }, {})
    }
}

function shouldActivityBeInReport(criteria: ReportCriteria, activity: Activity): boolean {
    let predicates: ((activity: Activity) => boolean)[] = [];
    if (!!criteria.type) {
        const neededType = criteria.type;
        predicates.push((activity: Activity) => activity.type === neededType);
    }

    if (criteria.isPositive === true) {
        predicates.push((activity: Activity) => activity.amount >= 0);
    } else if (criteria.isPositive === false) {
        predicates.push((activity: Activity) => activity.amount < 0);
    }

    return predicates.reduce<boolean>((pV, predicate) => pV && predicate(activity), true);
}

function executeCancelOutActionOnActivities(action: CancelOutAction, activities: Activity[]): void {
    let allValidSrc = activities.filter((a) => a.type === action.criteria.aType);
    let allValidDst = activities.filter((a) => a.type === action.criteria.bType);

    allValidSrc.forEach((src) => {
        let matchOn = action.criteria.matchOn;
        let matchOnValue = src.metadata[matchOn];
        let dst = allValidDst.filter((dst) => dst.metadata[matchOn] === matchOnValue)[0];
        if (!!dst) {
            console.log(`Executing action '${action.title}' to ${JSON.stringify(src)} and ${JSON.stringify(dst)}`);
            let idxOfSrc = activities.indexOf(src);
            activities.splice(idxOfSrc, 1);
            let idxOfDst = activities.indexOf(dst);
            activities.splice(idxOfDst, 1);
        }
    });
}

function writeReport(reportsFile: string, report: Report, activities: Activity[]) {
    fs.appendFileSync(reportsFile, "----------------------------\n")
    fs.appendFileSync(reportsFile, `${report.title}\n`);
    if (report.type === "Sum") {
        writeSumReport(reportsFile, report, activities);
    } else if (report.type === "Print") {
        writePrintReport(reportsFile, report, activities);
    }
}

function writeSumReport(reportsFile: string, report: SumReport, activities: Activity[]) {
    let sum = 0;
    activities.forEach((activity) => {
        if (shouldActivityBeInReport(report.criteria, activity)) {
            sum += activity.amount;
        }
    });
    fs.appendFileSync(reportsFile, `$${sum.toLocaleString()}\n`);
}

function writePrintReport(reportsFile: string, report: PrintReport, activities: Activity[]) {
    activities.forEach((activity) => {
        if (shouldActivityBeInReport(report.criteria, activity)) {
            fs.appendFileSync(reportsFile, `${activity.date.toLocaleDateString()}, $${activity.amount.toLocaleString()}, ${activity.description},${activity.type}\n`);
        }
    });
}
