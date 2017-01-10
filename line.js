const AWS = require("aws-sdk");
const client = require('superagent');
const LINEBot = require('line-messaging');

const channelID = 'channelID';
const channelSecret = 'channelSecret';
const channelToken = 'channelToken';
const lineUrl = 'https://api.line.me/v2/bot/message/reply';

const DOCOMO_API_KEY = 'DOCOMO_API_KEY';
const docomoUrl = `https://api.apigw.smt.docomo.ne.jp/dialogue/v1/dialogue?APIKEY=${DOCOMO_API_KEY}`;

const RES_IMGS = {
  aragaki: '',
  ANGRY: [
    '',
  ],
  CALM: [
    '',
  ],
  HAPPY: [
    '',
  ],
  SAD: [
    '',
  ],
  CONFUSED: [
    '',
  ],
  SURPRISED: [
    '',
  ],
};

const rekognition = new AWS.Rekognition();

const bot = LINEBot.create({
  channelID,
  channelSecret,
  channelToken,
});

function pickupRandom(items) {
  if (items) {
    return items[Math.floor(Math.random() * items.length)];
  }
  return RES_IMGS.aragaki;
}

function makeMessageFromFaceDetail(data) {
  const faceFeatures = [
    'Smile',
    'Eyeglasses',
    'Gender',
    'Sunglasses',
    'Beard',
    'Mustache',
    'EyesOpen',
    'MouthOpen',
  ];
  var mes = '';
  var emo = '';
  faceFeatures.forEach((feature) => {
    const val = data[feature];
    mes += `${feature}: ${val.Value === true ? 'o' : (val.Value || 'x')}  ${Math.round(val.Confidence)} %\n`;
  });
  data.Emotions.forEach((emotion) => {
    emo += `Emotion: ${emotion.Type}: ${Math.round(emotion.Confidence)} %\n`;
  });
  mes = mes.replace(/\n+$/g, '');
  emo = emo.replace(/\n+$/g, '');
  const emoType = data.Emotions[0].Type;

  return { mes, emo, emoType, gender: data.Gender.Value };
}

module.exports.webhook = (event, context, callback) => {
  const body = JSON.parse(event.body);
  body.events.forEach((data) => {
    const replyToken = data.replyToken;
    const message = data.message;
    var messages;

    switch (message.type) {
      case 'image':
        bot.getMessageContent(message.id).then((res) => {
          const mes = [];
          const buf = new Buffer(res);
          const param = {
            Image: {
              Bytes: buf,
            },
          };

          rekognition.detectLabels(param, (err, labelData) => {
            if (err) {
              console.log(err, err.stack);
            } else {
              labelData.Labels.forEach((label) => {
                mes.push(`${label.Name}: ${Math.round(label.Confidence)}`);
                if (label.Name === 'Person') {
                  rekognition.detectFaces({ Image: param.Image, Attributes: ['ALL'] }, (error, faceData) => {
                    if (error) {
                      console.log(error, error.stack);
                    } else {
                      faceData.FaceDetails.forEach((detail) => {
                        const msg = makeMessageFromFaceDetail(detail);
                        setTimeout(() => {
                          bot.pushTextMessage(data.source.userId, `${msg.mes}\n\n${msg.emo}`);
                        }, 2000);
                        const imgPath = pickupRandom(RES_IMGS[msg.emoType]);
                        setTimeout(() => {
                          bot.pushImageMessage(
                            data.source.userId,
                            imgPath, imgPath);
                        }, 3000);
                      });
                    }
                  });
                }
              });

              // なぜかline-messagingでpost処理ができなかったのでsuperagentで代用
              client
                .post(lineUrl)
                .set('Content-type', 'application/json; charset=UTF-8')
                .set('Authorization', `Bearer ${channelToken}`)
                .send({
                  replyToken,
                  messages: [
                    {
                      type: 'text',
                      text: mes.join('\n'),
                    },
                  ],
                })
                .end((error) => {
                  if (error) {
                    console.log(error);
                  }
                });
            }
          });
        });
        break;

      case 'text':
        client.post(docomoUrl)
          .send({
            utt: message.text,
            nickname: null,
            context: null,
          })
          .end((error, zatudanData) => {
            client
              .post(lineUrl)
              .set('Content-type', 'application/json; charset=UTF-8')
              .set('Authorization', `Bearer ${channelToken}`)
              .send({
                replyToken,
                messages: [
                  {
                    type: 'text',
                    text: zatudanData.body.utt,
                  },
                ],
              })
              .end((err) => {
                if (err) {
                  console.log(err);
                }
              });
          });
        break;
      default:
        break;
    }
  });
  callback(null, { statusCode: 200, body: JSON.stringify({}) });
};
