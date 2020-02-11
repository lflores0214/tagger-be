// ****** DEPENDENCIES *********
const router = require("express").Router();
const axios = require("axios");
require("dotenv").config();
const rateLimit = require("axios-rate-limit");
const Imap = require("imap");
const inspect = require("util").inspect;
const simpleParser = require("mailparser").simpleParser;
const Users = require("../users/user-model");
const Messages = require("./message-model");
const Tags = require("../tags/tag-model");

// ******* GLOBAL VARIABLES **********
const http = rateLimit(axios.create(), {
  maxRequests: 1,
  perMilliseconds: 1750
});
http.getMaxRPS();

router.get("/", (req, res) => {
  Messages.emails()
    .then(emails => {
      res.status(200).json(emails);
    })
    .catch(err => {
      console.log(err);
      res.status(500);
    });
});

// ********* THE NEW ROUTE WITH IMAP FOR TAGGING************
router.post("/", (req, res) => {
  const { email, host, token } = req.body;
  const allMessages = [];

  var imap = new Imap({
    user: email,
    password: "",
    host: host,
    port: 993,
    tls: true,
    xoauth2: token,
    tlsOptions: { rejectUnauthorized: false },
    debug: console.log
  });
  let userId;
  let emailsIds = [];
  Users.findUser(email).then(user => {
    if (user) {
      Messages.getEmailIds(user.id).then(message => {
        message.forEach(id => {
          emailsIds.push(id.message_id);
        });
        userId = user.id;
        return emailsIds, userId;
      });
    } else {
      const emailObj = {
        email
      };
      Users.addUser(emailObj).then(user => {
        return (userId = user.id);
      });
    }
  });

  let emailText;
  let emailUID = [];
  let emailData = [];

  function openInbox(cb) {
    imap.openBox("INBOX", true, cb);
  }

  imap.once("ready", function() {
    openInbox(function(err, box) {
      if (err) throw err;
      imap.search(["ALL"], function(err, results) {
        if (err) throw err;
        var f = imap.fetch(results, { bodies: "", attributes: "" });
        f.on("message", function(msg, seqno) {
          // console.log("Message #%d", seqno);
          var prefix = "(#" + seqno + ") ";
          msg.on("body", function(stream, info) {
            simpleParser(stream, { bodies: "", attributes: "" }).then(
              parsed => {
                // Tags.getTagsByMessageId(parsed.messageId).then(tags => {
                // console.log(parsed.f);
                // console.log(parsed.)
                let addEmailObj = {
                  message_id: parsed.messageId,
                  user_id: userId,
                  from: parsed.from.value[0].address,
                  name: parsed.headers.get("from").value[0].name,
                  to: parsed.headers.get("to").text,
                  subject: parsed.subject,
                  email_body: parsed.html,
                  email_body_text: parsed.text
                };
                // let newObj = {
                //   html: parsed.html,
                //   text: parsed.text,
                //   from: parsed.from.value[0].address,
                //   subject: parsed.subject,
                //   attachments: parsed.attachments,
                //   id: parsed.messageId,
                //   uid: 0,
                //   tags
                // };
                // console.log(addEmailObj, "EMAIL BODIES HHEHEHEHHEEHERE");
                // emailText = addEmailObj;
                allMessages.push(addEmailObj);
                console.log(allMessages.length, "adding!");
              }
            );
            //Sending the new message to DS for tagging
            // const dataPackage = {
            //   sender: parsed.from.value[0].address,
            //   id: parsed.messageId,
            //   subject: parsed.subject,
            //   message: parsed.html
            // };
            // http
            //   .post(
            //     "http://LstmModel-env.4zqtqnkaex.us-east-1.elasticbeanstalk.com/api/tags",
            //     dataPackage
            //   )
            //   .then(res => {
            // })
            // .catch(err => {
            //   console.log("\n\n\nerr: ", err);
            // });
          });
          msg.once("attributes", function(attrs) {
            const uid = {
              uid: attrs.uid
            };
            emailUID.push(uid);

            // const found = emailsIds.includes(element.messageId);
            // if (!found) {
            //   element.uid = attrs.uid;
            //   let sqlEmailId;

            // console.log(parsed.headers.get("to").text);
            // Messages.addEmail(element).then(message => {
            //   sqlEmailId = message.id;
            // let dataTag = res.data.tag;

            // dataTag.forEach(tag => {
            //   let newObj = {
            //     tag,
            //     email_id: sqlEmailId
            //   };
            //   Tags.addTag(newObj);
            // });
            // });
            // })
            // .catch(err => {
            //   console.log(
            //     err,
            //     "Error for posting to DS api for tagging"
            //   );
            // });
            // console.log(message, "the last message");
            // console.log(attrs.uid, "the last message");

            // console.log(prefix + "Attributes: %s", inspect(attrs, false, 8));
            // }
          });
          msg.once("end", function() {
            console.log(prefix + "Finished");
          });
        });
        f.once("error", function(err) {
          console.log("Fetch error: " + err);
        });
        f.once("end", function() {
          console.log("Done fetching all messages!");
          console.log(emailUID.length, "EMAIL UIDS ARRAYS LENGTH");
          setTimeout(function() {
            console.log(allMessages.length, "ALL MESSAGES LENGTH");
            let newArray = [];
            for (i = 0; i < allMessages.length; i++) {
              let message = allMessages[i];
              let uid = emailUID[i];
              let newObj = {
                ...message,
                ...uid
              };
              newArray.push(newObj);
            }
            console.log(newArray);
            // const found = emailsIds.includes(element.messageId);
            // if (!found) {
            Messages.addEmail(newArray)
              .then(message => {
                res.status(200).json(newArray);
              })
              .catch(err => {
                console.log(err);
              });
            // }
            imap.end();
          }, 1000);
        });
      });
    });
  });

  imap.once("error", function(err) {
    console.log(err);
  });

  imap.once("end", function() {
    console.log("Connection ended");
  });

  imap.connect();
});

module.exports = router;
