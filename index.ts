import {
    readConfigFile,
    getFilesToAnalyze,
    parseFilesToRawActivities,
    applyRulesToRawActivities,
    sortActivitesByDate,
    executeActionsOnActivities,
    writeReports
} from "./lib";

let { rules, actions, reports } = readConfigFile();
let filesToAnalyze = getFilesToAnalyze();
let rawActivities = parseFilesToRawActivities(filesToAnalyze);
let activities = applyRulesToRawActivities(rules, rawActivities);
activities = sortActivitesByDate(activities);
activities = executeActionsOnActivities(actions, activities);
writeReports(reports, activities);
