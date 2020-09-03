<script lang="ts">
  import { onMount } from "svelte";
  import {
    Col,
    Container,
    FormGroup,
    Row,
    Input,
    Label,
    Button,
  } from "sveltestrap";
  import Form from "./Form.svelte";
  import Preview from "./Preview.svelte";
  import Lesson from "./Lessons/Lesson.svelte";
  import { saveAs } from "file-saver";
  import lessonStore from "./lesson.store";
  import type { Lesson as LessonType } from "./lesson";

  let lessonType = "Lesson";
  let left;
  let lessonObject: LessonType;
  let fileList;
  let formData;

  onMount(() => {
    left = document.body.clientWidth / 2 + 40;
  });

  function download() {
    if (formData.title !== "") {
      const blob = new Blob([JSON.stringify(formData)], {
        type: "application/json;charset=utf-8",
      });
      saveAs(blob, formData.title + ".json");
    }
  }

  function upload() {
    const file = fileList[0];
    if (!file) {
      return;
    }
    const fr = new FileReader();
    fr.onload = function () {
      const json = JSON.parse(fr.result.toString());
      formData = json;
    };

    fr.readAsText(file);
  }
  $: lessonStore.set(formData);
</script>

<style>
  :global(.control-btns) {
    position: absolute;
    bottom: 10px;
  }
</style>

<Container>
  <Row>
    <Col>
      <h1>Lesson Builder</h1>
    </Col>
  </Row>
  <Row>
    <Col md="3">
      <FormGroup>
        <Label for="lessonFile">Lesson File</Label>
        <Input
          size="0"
          bind:files={fileList}
          readonly={false}
          type="file"
          name="file"
          accept="application/json"
          id="lessonFile" />
      </FormGroup>
    </Col>
    <Col md="2">
      <Button on:click={upload} class="control-btns" color="primary">
        Load
      </Button>
    </Col>
    <Col md="2">
      <Button class="control-btns" on:click={download} color="success">
        Download
      </Button>
    </Col>
  </Row>
  <Row>
    <Col md="6">
      <Form bind:formData />
    </Col>
    <Col md="6">
      <Preview bind:preview={lessonType} />
    </Col>
  </Row>
</Container>
<!-- Doing this because of absolute positioning -->
{#if lessonType == 'Lesson'}
  <Lesson top={270} {left} />
{/if}
