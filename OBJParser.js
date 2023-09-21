// reference: http://web.cse.ohio-state.edu/~shen.94/581/Site/Lab3_files/Labhelp_Obj_parser.htm
// veeeery naive approach to parse .obj, but it doeas the job
import { vec3 } from "./Math/index.js";

export class OBJParser {
    constructor() { }

    async parseFile(path) {
        const data = await (await fetch(path)).text()
        const result = {}
        const dataList = data.split(/\r?\n/).filter(line => (line.length > 0 && /\S/.test(line)))
        let currentGroup = ""
        for (let i = 0; i < dataList.length; i++) {
            const dataType = dataList[i].split(" ").filter(v => v.length).slice(0, 1)[0]
            switch (dataType) {
                case "g":
                    const groupName = dataList[i].slice(1).trim();
                    result[groupName] = {}
                    currentGroup = groupName
                    break;
                case "v":
                    const vertexData = dataList[i].split(" ").filter(v => v.length).slice(1)
                    if (result[currentGroup]) {
                        if (result[currentGroup].hasOwnProperty('vertices')) {
                            result[currentGroup].vertices.push(vec3.fromValues(vertexData[0], vertexData[1], vertexData[2]))
                        } else {
                            result[currentGroup].vertices = []
                            result[currentGroup].vertices.push(vec3.fromValues(vertexData[0], vertexData[1], vertexData[2]))
                        }
                    }
                    break;
                // TODO: vn (texture coordinate)
                case "f":
                    const facesArray = dataList[i].split(" ").filter(v => v.length).slice(1)
                    // TODO: take into account texture/normal (these are optional)
                    for (let k = 0; k < facesArray.length / 3; k++) {
                        const faceA = facesArray[k * 3][0] - 1
                        const faceB = facesArray[k * 3 + 1][0] - 1
                        const faceC = facesArray[k * 3 + 2][0] - 1
                        if (result[currentGroup]) {
                            if (result[currentGroup].hasOwnProperty('faces')) {
                                result[currentGroup].faces.push({ A: faceA, B: faceB, C: faceC })
                            } else {
                                result[currentGroup].faces = []
                                result[currentGroup].faces.push({ A: faceA, B: faceB, C: faceC })

                            }
                        }
                    }
                    break;
            }
        }
        console.log(result)
        return result
    }

}