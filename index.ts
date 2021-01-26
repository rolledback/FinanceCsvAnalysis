import {
    readConfigFile,
    getFilesToAnalyze,
    parseFilesToRawActivities,
    parseFilesToActivities,
    applyRulesToRawActivities,
    sortActivitesByDate,
    executeActionsOnActivities,
    writeOutFile,
    getCommand,
    log
} from "./lib";
import { Activity } from "./types";

let { rules, actions } = readConfigFile();
let command = getCommand();
let filesToAnalyze = getFilesToAnalyze();
let activities: Activity[];
if (command === "analyze") {
    log("Analyzing files...");
    let rawActivities = parseFilesToRawActivities(filesToAnalyze);
    activities = applyRulesToRawActivities(rules, rawActivities);
} else {
    log("Combining files...");
    activities = parseFilesToActivities(filesToAnalyze);
}
activities = sortActivitesByDate(activities);
activities = executeActionsOnActivities(actions, activities);
writeOutFile(activities);
