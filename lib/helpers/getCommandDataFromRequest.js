import { REG_EXPS } from '../helpers/constants'

let getCommandDataFromRequest = function (fullRequestOptions) {
    const cmdNameRes = fullRequestOptions.uri.path.match(REG_EXPS.command) || []
    const cmdName = cmdNameRes[1] || fullRequestOptions.uri.path

    const result = (data) => ({ cmdName, cmdData: data || '' })

    const { json: cmdJson } = fullRequestOptions

    if (typeof cmdJson !== 'object') {
        return result()
    }

    const { script, value } = cmdJson

    if (script) {
        const scriptRes = script.match(REG_EXPS.executeFunction) || []

        return result(scriptRes[1] || script)
    }

    if (value) {
        return result(Array.isArray(value) ? value.join('') : value)
    }

    let res

    // do not fail if json contains circular refs
    try {
        res = Object.keys(cmdJson).length ? JSON.stringify(cmdJson) : ''
    } catch (e) {}

    return result(res)
}

export default getCommandDataFromRequest
