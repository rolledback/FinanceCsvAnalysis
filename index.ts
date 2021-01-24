import {
    readConfigFile,
    getFilesToAnalyze,
    parseFilesToRawActivities,
    applyRulesToRawActivities,
    sortActivitesByDate,
    executeActionsOnActivities,
    writeOutFile
} from "./lib";

let { rules, actions } = readConfigFile();
let filesToAnalyze = getFilesToAnalyze();
let rawActivities = parseFilesToRawActivities(filesToAnalyze);
let activities = applyRulesToRawActivities(rules, rawActivities);
activities = sortActivitesByDate(activities);
activities = executeActionsOnActivities(actions, activities);
writeOutFile(activities);
