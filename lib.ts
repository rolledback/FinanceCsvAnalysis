import * as process from "process";
import * as fs from "fs";
import * as path from "path";

import {
    RawActivity,
    Activity,
    Rule,
    Action,
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
const targetDir = argv[0].replace("\"", "");

if (!targetDir) {
    throw new Error("No target directory specified.");
}
const outputDir = path.join(targetDir, "out");
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

export function readConfigFile(): { rules: Rule[], actions: Action[] } {
    let configFile = path.join(targetDir, "config.json");

    if (!fs.existsSync(configFile)) {
        throw new Error(`Target directory ${targetDir} must contain a config.json file.`);
    }

    let configFileParsed = (JSON.parse(fs.readFileSync(configFile).toString()));

    return {
        rules: (configFileParsed.rules as Rule[]).reduce<Rule[]>((pV, cV) => {
            typeof cV.descriptionRegex === "string" ? pV.push(cV) : pV.push(...cV.descriptionRegex.map<Rule>((regex) => {
                return {
                    title: cV.title,
                    descriptionRegex: regex,
                    result: cV.result
                };
            }));
            return pV;
        }, []),
        actions: configFileParsed.actions
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

export function writeOutFile(activities: Activity[]) {
    console.log("Writing out file...");
    let csvFile = path.join(outputDir, "activities.csv");
    if (fs.existsSync(csvFile)) {
        fs.unlinkSync(csvFile);
    }

    let maxCategories = activities.reduce((pV, cV) => Math.max(pV, cV.categories.length), 0);
    let appendCsv = (str: string) => fs.appendFileSync(csvFile, str + "\n");

    appendCsv("Date,Amount,Description,Type," + Array(maxCategories).fill("").map((x, i) => `Category ${i}`).join(","));
    activities.forEach((activity) => {
        appendCsv(`${activity.date.toLocaleDateString()}, $${activity.amount}, ${activity.description},${activity.type},` + Array(maxCategories).fill("").map((x, i) => `${activity.categories[i] || ""}`).join(","));
    });
    console.log(`Done. Path: ${csvFile}`);
}

function parseFileToRawActivities(file: string): RawActivity[] {
    const dateColumn = 0;
    const amountColumn = 1;
    const descriptionColumn = 2;
    const firstCategoryColumn = 3;
    return fs.readFileSync(file)
        .toString()
        .split(/\r?\n/)
        .filter((line) => !!line)
        .slice(1)
        .map<RawActivity>((line) => {
            let lineSplit = line.split(",");
            const maxCategoryColumn = lineSplit.length - 1;
            return {
                date: extractStrRowValue(lineSplit, dateColumn),
                amount: extract$RowValue(lineSplit, amountColumn),
                file: path.basename(file),
                description: extractStrRowValue(lineSplit, descriptionColumn),
                categories: extractStrRowValues(lineSplit, firstCategoryColumn, maxCategoryColumn)
            };
        });
}

function extractStrRowValue(row: string[], idx: number): string | undefined {
    let rowValue = row[idx];
    if (!!rowValue) {
        if (rowValue[0] === "\"" && rowValue[rowValue.length] === "\"") {
            rowValue = rowValue.slice(1, -1);
        }
        rowValue = rowValue.trim();
    }

    return rowValue;
}

function extractStrRowValues(row: string[], startIdx: number, endIdx: number): (string | undefined)[] {
    let retValue: string[] = [];
    let currValue: string | undefined = undefined;
    do {
        currValue = extractStrRowValue(row, startIdx++);
        if (!!currValue) {
            retValue.push(currValue);
        }
    } while (!!currValue && startIdx <= endIdx)

    return retValue;
}

function extract$RowValue(row: string[], idx: number): (number | undefined) {
    let str = extractStrRowValue(row, idx);
    if (!!str) {
        if (str[0] === "$") {
            str = str.slice(1);
        } else {
            str = str.slice(0);
        }
        return Number.parseFloat(str);
    } else {
        return undefined;
    }
}

function applyRulesToRawActivity(rules: Rule[], rawActivity: RawActivity): Activity {
    for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        if (doesRuleApply(rule, rawActivity)) {
            let result = applyRule(rule, rawActivity);
            console.log(`Applying rule '${rule.title}' to ${JSON.stringify(rawActivity)} => ${JSON.stringify(result)}`);
            return result;
        }
    }

    // console.log(`Applying default rule to ${JSON.stringify(rawActivity)}`);
    return applyRule(defaultParsingRule, rawActivity);
}

function doesRuleApply(rule: Rule, rawActivity: RawActivity): boolean {
    let predicates: ((rawActivity: RawActivity) => boolean)[] = [];
    if (Array.isArray(rule.descriptionRegex)) {
        throw new Error("Rules with array descriptionRegex should have been expanded before calling doesRuleApply");
    } else {
        const regex = rule.descriptionRegex;
        predicates.push((rawActivity: RawActivity) => new RegExp(regex).test(rawActivity.description));
        return predicates.reduce<boolean>((pV, predicate) => pV && predicate(rawActivity), true);
    }
}

function applyRule(rule: Rule, rawActivity: RawActivity): Activity {
    if (Array.isArray(rule.descriptionRegex)) {
        throw new Error("Rules with array descriptionRegex should have been expanded before calling doesRuleApply");
    } else {
        let descriptionRegexExec = new RegExp(rule.descriptionRegex).exec(rawActivity.description);
        return {
            type: rule.result.type,
            description: rawActivity.description,
            amount: rawActivity.amount,
            date: new Date(rawActivity.date),
            file: rawActivity.file,
            metadata: Object.keys(rule.result.metadata || {})
                .reduce<{}>((pV, cV) => {
                    let value = rule.result.metadata[cV];
                    if (typeof value === "string") {
                        if (value === "<file>") {
                            pV[cV] = rawActivity.file;
                        } if (value === "<amount>") {
                            pV[cV] = rawActivity.amount;
                        } else {
                            pV[cV] = value;
                        }
                    } else {
                        pV[cV] = descriptionRegexExec[value];
                    }
                    return pV;
                }, {}),
            categories: rule.result.categories || []
        }
    }
}

function executeCancelOutActionOnActivities(action: CancelOutAction, activities: Activity[]): void {
    let allValidSrc = activities.filter((a) => a.type === action.criteria.aType);
    let allValidDst = activities.filter((a) => a.type === action.criteria.bType);

    allValidSrc.forEach((src) => {
        let matchOn = action.criteria.matchOn;
        let matchOnValue = src.metadata[matchOn];
        let dst = allValidDst.filter((dst) => {
            if (typeof matchOnValue === "number") {
                return Math.abs(dst.metadata[matchOn]) === Math.abs(matchOnValue);
            } else if (typeof matchOnValue === "string") {
                return dst.metadata[matchOn] === matchOnValue;
            }
        })[0];
        if (!!dst) {
            console.log(`Executing action '${action.title}' to ${JSON.stringify(src)} and ${JSON.stringify(dst)}`);
            let idxOfSrc = activities.indexOf(src);
            activities.splice(idxOfSrc, 1);
            let idxOfDst = activities.indexOf(dst);
            activities.splice(idxOfDst, 1);
        } else {
            console.log(`Failed to execute action '${action.title}' to ${JSON.stringify(src)}`);
        }
    });
}
