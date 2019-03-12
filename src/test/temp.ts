#!/usr/bin/env ts-node

const searchme = 'quest-${DeploymentStage}-ApiGatewayEndpointSecurityGroup';
const regEx = new RegExp('\\${[^}]*}', 'g');
// const regEx = new RegExp('\\$.*', 'g');
console.log(`Matching on ${searchme}`);
let match = (regEx.exec(searchme) as RegExpExecArray);
console.log(`MATCH: ${match} `);
match = (regEx.exec(searchme) as RegExpExecArray);
console.log(`MATCH: ${match} `);