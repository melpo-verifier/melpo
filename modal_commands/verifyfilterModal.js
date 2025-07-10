//BROKEN CODE, HERE FOR REFERENCE, BUT PROBABLY WONT BE USED SINCE USING DISCORD AUTOMOD RULES WOULD BE EASIER

// const questioninfo = require('../button_commands/setupbuttons/questioninfo.js');
// const { createTemporarySetup, updateTemporarySetup } = require('../js/tempconfigfuncs.js');

// module.exports = async ({interaction, client}) => {
//     const words = interaction.fields.getTextInputValue(`blacklistedwords`);
//     var wordsArray = words ? words.split('\n') : [];

//     const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

//     if (!temporarySetup.questions) {
//         temporarySetup.questions = [];
//     }

//     temporarySetup.questions.push({ content: question, mcq: mcqArray });

//     // Parse any stringified JSON objects in the questions array
//     temporarySetup.questions = temporarySetup.questions?.map(q => {
//         if (typeof q === 'string') {
//             try {
//                 return JSON.parse(q);
//             } catch (error) {
//                 console.error('Failed to parse question:', error);
//                 return null;
//             }
//         }
//         return q;
//     }).filter(q => q !== null); // Filter out any null values from failed parsing

//     await updateTemporarySetup(interaction.guild.id, { questions: temporarySetup.questions });

//     if (isfirsttime === 0) {
//         questioninfo({interaction, client});
//     } else {
//         const firsttimequestions = require('../js/firsttimequestions.js');

//         firsttimequestions({interaction, client});
//     }
// };
