import {
    readConfigFile,
    getFilesToAnalyze,
    parseCsvFilesToRawActivities,
    parseActivityFilesToActivities,
    applyRulesToRawActivities,
    sortActivitesByDate,
    executeActionsOnActivities,
    writeActivityFile,
    getCommand,
    log
} from "./lib";
import { Activity } from "./types";

let { rules, actions } = readConfigFile();
let command = getCommand();
let filesToAnalyze = getFilesToAnalyze();
let activities: Activity[];
if (command === "analyze") {
    log("Analyzing csv files...");
    let rawActivities = parseCsvFilesToRawActivities(filesToAnalyze);
    activities = applyRulesToRawActivities(rules, rawActivities);
} else {
    log("Combining activity files...");
    activities = parseActivityFilesToActivities(filesToAnalyze);
}
activities = sortActivitesByDate(activities);
activities = executeActionsOnActivities(actions, activities);
writeActivityFile(activities);
