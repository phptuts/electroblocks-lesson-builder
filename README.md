## Electroblocks Lesson Builder

So this was built to make it easier to build json files for lessons.

[Lesson Builder](https://phptuts.github.io/electroblocks-lesson-builder/)

## Setup

So in order to use this you will need to create a folder structure like so

lessons
{author folder name you choose}
{lesson folder name}

A preview picture should be named main.{png|jpg|gif}
The following picture should be names step\_{whatever step you are on}.png

Here is a good example

- main.png
- step_1.jpg
- step_2.jpg
- step_3.png

You can also choose to do a youtube video / videos for your slide. A youtube video id is required.

Once you have a picture and you want to preview how it will look run a node server in the folder containing the lesson folder. Be sure you use port 3000. If you don't have node installed go to nodejs.org.

```bash
npx http-server -p 3000
```

## Submitting Lessons

Once you have your lesson ready to go you can either submit a pr request or email it to me at glaserpower [@] gmail.com. I will have more information on doing pr once I have built it. PR will be the preferred way of submitting lessons.
