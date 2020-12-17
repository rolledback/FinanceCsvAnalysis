# Finance CSV Analysis

This program was created to help analyze the activity of multiple financial accounts via combining CSV activity data of each account.

The original problem that motivated this program was:

> I have two accounts.
>
> The first account is a savings account, which is:
> 1. Where my paychecks are deposited.
> 2. Used to pay for some things.
> 3. Regularly transfers money to my checking account.
>
> The second account is a checking account, which is:
> 1. Used to pay for some things.
> 2. Used to pay off credit card accounts.
>

Because of the relationship that exists between the two accounts, it was hard to get an exact count of how much money I was spending. I could not simply look at withdrawls from the savings account, as some of the withdrawls were transfers to checking. I also could not simply look at withdrawls from checking, because not everything is paid for via checking.

To solve this problem, I had to manually take the account activity of both accounts and combine them. Then, when looking at the combined data, the transfers between the two accounts would cancel out. This program automates that process, not only for the original two accounts, but for as many accounts as I can associate via CSV activity data, and it then lets me generate reports on the resulting dataset.

## Building and running
To build and run this program:
```
npm install
npm run build
npm start <target directory>
```

The `<target directory>` can contain any number of `.csv` files and a `config.json` file (see below). The `config.json` file specifies how the program should parse the `.csv` files and what to do with the results of the parse. The `.csv` files must have no headers, and columns 1, 2, and 3 should be date, amount, and description. If cell values start and end with quote characters ("), then they will be ignored.

## `config.json`

The `config.json` file has three sections: `rules`, `actions`, and `reports`.

### `rules`

The `rules` section specifies how the rows of a each `.csv` file should be parsed. When a rule is applied to a row and `Activity` will be outputted.

For example, this rule will be applied to any row which has a description that matches the regular expression `/ONLINE TRANSFER TO ACCOUNT XXXXXX1234 REF #(.+) ON (.+)/`:
```json
{
    "title": "Transfer to Checking",
    "descriptionRegex": "ONLINE TRANSFER TO ACCOUNT XXXXXX1234 REF #(.+) ON (.+)",
    "result": {
        "type": "InternalTransferSend",
        "metadata": {
            "id": 1
        }
    }
}
```
The application of this rule will output an `Activity` like:
```js
{
    type: 'InternalTransferSend',
    description: 'ONLINE TRANSFER TO ACCOUNT XXXXXX1234 REF #IB07GPKKBD ON 01/11/20',
    amount: -500,
    date: 2020-01-13T08:00:00.000Z,
    file: 'Savings.csv',
    metadata: { id: 'IB07GPKKBD ON 01/11/20' }
}
```

For any row which there is no applicable rule, a built-in default rule, will be applied.

If a row matches multiple rules, the rule which is declared first will be used.

### `actions`

The `actions` section specifies actions you want performed to the `Activity` objects outputted by parsing the rows of the `.csv` files. As of now, the only available action is `CancelOut`.

The `CancelOut` action looks for pairs of `Activities` that cancel each other out and removes them. For example:
```json
{
    "type": "CancelOut",
    "title": "Transfer: Savings -> Checking",
    "criteria": {
        "aType": "InternalTransferSend",
        "bType": "InternalTransferReceive",
        "matchOn": "id"
    }
}
```
In plain english, this action says:
> If there is an `Activity` with type `InternalTransferSend` and an `Activity` with type `InternalTransferReceive` and both have a `metadata` with key `id` and the same value, then those activities cancel each other out and should therefore be removed.

If a row has multiple rules which are applicable, then the rules will be executed in the order they are declared.

### `reports`

The `reports` section specifies any reports you want generated on the `Activity` objects that remain after all `actions` are performed. There are currently two types of reports.
1. `Sum` - sum the amounts of all `Activity` objects which match the specified `critiera`
2. `Print` - print all `Activity` objects which match the specified `critiera`

A report must specify `critiera`. For example:

This report will sum all `Activity` objects which have a type of `"Income"`:
```json
 {
    "type": "Sum",
    "title": "Total Income",
    "criteria": {
        "type": "Income"
    }
}
```

This report will print all `Activity` objects which have a negative amount:
```json
{
    "type": "Print",
    "title": "Money Out",
    "criteria": {
        "isPositive": false
    }
}
```

After running the program, you can find a `reports.txt` file in the `<target directory>`.

Reports are generated in the order they appear.
