import * as process from "process";
import * as fs from "fs";
import * as path from "path";

import {
    RawActivity,
    Activity,
    Rule,
    Action,
    CancelOutAction,
    Imports,
} from "./types";

const defaultParsingRule: Rule = {
    "title": "Other",
    "descriptionRegex": ".*",
    "result": {
        "type": "Other",
        "metadata": {}
    },
    sourceFile: "N/A"
};

const argv = process.argv.slice(2);
const command = argv[0];
const targetDir = argv[1].replace("\"", "");
const maybeConfigFile = argv[2]

if (!targetDir) {
    throw new Error("No target directory specified.");
}
const outputDir = path.join(targetDir, "out");
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
const logFile = path.join(outputDir, "log.txt");
if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
}

log(`argv: ${argv}`);
log(`targetDir: ${targetDir}`);
log(`outputDir: ${outputDir}`);

export function getCommand(): "analyze" | "join" {
    if (command !== "analyze" && command !== "join") {
        throw new Error("Invalid command.");
    }
    return command;
}

export function readConfigFile(filePath?: string): { rules: Rule[], actions: Action[] } {
    let configFile = filePath || maybeConfigFile || path.join(targetDir, "config.json");

    if (!fs.existsSync(configFile)) {
        log(`No config file ${configFile} found.`);
        return { rules: [], actions: [] };
    }
    log(`Reading config file ${configFile}`);

    let configFileParsed: { rules: Rule[], actions: Action[], imports?: Imports, fileName: string } = { ...JSON.parse(fs.readFileSync(configFile).toString()), fileName: path.basename(configFile) };

    let importedFiles: { rules: Rule[], actions: Action[], imports?: Imports }[] = (configFileParsed.imports || []).map((i) => readConfigFile(path.resolve(targetDir, i)));

    return {
        rules: (configFileParsed.rules as Rule[]).reduce<Rule[]>((pV, cV) => {
            typeof cV.descriptionRegex === "string" ? pV.push(cV) : pV.push(...cV.descriptionRegex.map<Rule>((regex) => {
                return {
                    title: cV.title,
                    descriptionRegex: regex,
                    result: cV.result,
                    sourceFile: configFileParsed.fileName
                };
            }));
            return pV;
        }, []).concat((importedFiles.map<Rule[]>((cV) => cV.rules)).flat()),
        actions: configFileParsed.actions.concat((importedFiles.map<Action[]>((cV) => cV.actions)).flat())
    };
}

export function getFilesToAnalyze(): string[] {
    let filesToAnalyze = fs.readdirSync(targetDir)
        .map((p) => path.join(targetDir, p))
        .filter((p) => fs.statSync(p).isFile())
        .filter((p) => path.extname(p) === ".csv")

    if (filesToAnalyze.length === 0) {
        throw new Error(`Target directory ${targetDir} must contain at least one .csv file.`);
    } else {
        log(`Got files: ${JSON.stringify(filesToAnalyze)}`);
    }

    return filesToAnalyze;
}

export function parseCsvFilesToRawActivities(files: string[]): RawActivity[] {
    return files.reduce<RawActivity[]>((pV, file) => {
        pV.push(...parseCsvFileToRawActivities(file));
        return pV;
    }, []);
}

export function applyRulesToRawActivities(rules: Rule[], rawActivities: RawActivity[]): Activity[] {
    let activities: Activity[] = [];
    let usedRules: Set<Rule> = new Set<Rule>();
    rawActivities.forEach((rawActivity) => {
        let result = applyRulesToRawActivity(rules, rawActivity);
        activities.push(result.activity);
        for (let rule of result.appliedRules) {
            usedRules.add(rule);
        }
    });

    logUnUsedRules(rules, usedRules);

    return activities;
}

export function parseActivityFilesToActivities(files: string[]): Activity[] {
    return files.reduce<Activity[]>((pV, file) => {
        pV.push(...parseActivityFileToActivities(file));
        return pV;
    }, []);
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

export function writeActivityFile(activities: Activity[]) {
    log("Writing activity file...");
    let csvFile = path.join(outputDir, "activities.csv");
    if (fs.existsSync(csvFile)) {
        fs.unlinkSync(csvFile);
    }

    let maxCategories = activities.reduce((pV, cV) => Math.max(pV, cV.categories.length), 0);
    let appendCsv = (str: string) => fs.appendFileSync(csvFile, str + "\n");
    appendCsv("Date,Amount,Description,Type," + Array(maxCategories).fill("").map((x, i) => `Category ${i}`).join(",") + ",File");
    activities.forEach((activity) => {
        appendCsv(`${activity.date.toLocaleDateString()},$${activity.amount},${activity.description.trim()},${activity.type.trim()},` + Array(maxCategories).fill("").map((x, i) => `${(activity.categories[i] || "").trim()}`).join(",") + `,${activity.file}`);
    });
    log(`Done. Path: ${csvFile}`);
}

export function log(message: string): void {
    fs.appendFileSync(logFile, [`[${new Date().toISOString()}]`, message].join(" ") + "\n");
}

function parseCsvFileToRawActivities(file: string): RawActivity[] {
    const dateColumn = 0;
    const amountColumn = 1;
    const descriptionColumn = 2;
    return fs.readFileSync(file)
        .toString()
        .split(/\r?\n/)
        .filter((line) => !!line)
        .filter((line) => line.match(/[^\s\\]/))
        .slice(1)
        .map<RawActivity>((line, idx) => {
            let lineSplit = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            let result = {
                date: extractStrRowValue(lineSplit, dateColumn),
                amount: extract$RowValue(lineSplit, amountColumn),
                file: path.basename(file),
                description: extractStrRowValue(lineSplit, descriptionColumn)
            };
            log(`Parsed line (${idx}) ${JSON.stringify(lineSplit)} to ${JSON.stringify(result)}`);
            return result;
        });
}

function parseActivityFileToActivities(file: string): Activity[] {
    const lines = fs.readFileSync(file)
        .toString()
        .split(/\r?\n/);
    const firstLine = lines.shift();
    const totalColumns = firstLine.split(",").length;
    const dateColumn = 0;
    const amountColumn = 1;
    const descriptionColumn = 2;
    const typeColumn = 3;
    const fileColumn = totalColumns - 1;
    const categoriesStart = 4;
    const categoriesEnd = fileColumn - 1;
    return lines.filter((line) => !!line)
        .filter((line) => line.match(/[^\s\\]/))
        .map<Activity>((line) => {
            let lineSplit = line.split(",");
            return {
                date: new Date(extractStrRowValue(lineSplit, dateColumn)),
                amount: extract$RowValue(lineSplit, amountColumn),
                type: extractStrRowValue(lineSplit, typeColumn),
                file: path.basename(file) + ` (${extractStrRowValue(lineSplit, fileColumn)})`,
                description: extractStrRowValue(lineSplit, descriptionColumn),
                categories: (categoriesStart !== fileColumn && categoriesEnd >= categoriesStart) ? extractStrRowValues(lineSplit, categoriesStart, categoriesEnd) : [],
                metadata: {}
            };
        });
}

function extractStrRowValue(row: string[], idx: number): string | undefined {
    let rowValue = row[idx];
    if (!!rowValue) {
        if (rowValue[0] === "\"" && rowValue[rowValue.length - 1] === "\"") {
            rowValue = rowValue.slice(1, -1);
        }
        rowValue = rowValue.trim();
    }
    rowValue = rowValue.replace(",", "");

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

function applyDefaultRuleToRawActivity(rawActivity: RawActivity): Activity {
    log(`Applying default rule to ${JSON.stringify(rawActivity)}`);
    return applyRule(defaultParsingRule, rawActivity);
}

function applyRulesToRawActivity(rules: Rule[], rawActivity: RawActivity): { activity: Activity, appliedRules: Set<Rule> } {
    let result: Activity | undefined;
    let appliedRules: Set<Rule> = new Set<Rule>();

    for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        if (doesRuleApply(rule, rawActivity)) {
            if (!result) {
                result = applyRule(rule, rawActivity);
                appliedRules.add(rule);
                log(`Applying rule '${rule.title}' via regex '${rule.descriptionRegex}' to ${JSON.stringify(rawActivity)} => ${JSON.stringify(result)}`);
            } else {
                log(`Rule '${rule.title}' via regex '${rule.descriptionRegex}' would have applied to ${JSON.stringify(rawActivity)} but a rule has already been applied.`);
            }
        }
    }

    return { activity: result || applyDefaultRuleToRawActivity(rawActivity), appliedRules: appliedRules };
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

    let pairsToCancelOut: { src: Activity, dst: Activity }[] = [];
    let activitiesToActUpon: Activity[] = [];

    allValidSrc.forEach((src) => {
        if (activitiesToActUpon.indexOf(src) === -1) {
            let matchOn = action.criteria.matchOn;
            let matchOnValue = matchOn === "<amount>" ? src.amount : src.metadata[matchOn];
            let dst = allValidDst.filter((dst) => {
                if (dst === src) {
                    return false;
                }
                if (activitiesToActUpon.indexOf(dst) !== -1) {
                    return false;
                }
                if (typeof matchOnValue === "number") {
                    let dstMatchOnValue = matchOn === "<amount>" ? dst.amount : src.metadata[matchOn];
                    return Math.abs(dstMatchOnValue) === Math.abs(matchOnValue);
                } else if (typeof matchOnValue === "string") {
                    return dst.metadata[matchOn] === matchOnValue;
                }
            })[0];
            if (!!dst) {
                pairsToCancelOut.push({ src: src, dst: dst });
                activitiesToActUpon.push(src);
                activitiesToActUpon.push(dst);
            } else {
                log(`Failed to execute action '${action.title}' to ${JSON.stringify(src)}`);
            }
        } else {
            log(`Skip executing action '${action.title}' on ${JSON.stringify(src)}, already set to be executed`);
        }
    });

    pairsToCancelOut.forEach((pair) => {
        log(`Executing action '${action.title}' to ${JSON.stringify(pair.src)} and ${JSON.stringify(pair.dst)}`);
        let idxOfSrc = activities.indexOf(pair.src);
        activities.splice(idxOfSrc, 1);
        let idxOfDst = activities.indexOf(pair.dst);
        activities.splice(idxOfDst, 1);
    });
}

function logUnUsedRules(rules: Rule[], usedRules: Set<Rule>) {
    log(`Used ${usedRules.size} / ${rules.length} rules`)
    for (let rule of rules) {
        if (!usedRules.has(rule)) {
            log(`Did not use rule '${rule.title}' with regexp '${rule.descriptionRegex}' from file '${rule.sourceFile}'`);
        }
    }
}
