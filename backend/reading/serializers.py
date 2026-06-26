from rest_framework import serializers
from .models import ReadingTest, ReadingPassage, ReadingQuestion, ReadingAttempt

class ReadingQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingQuestion
        fields = ['id', 'question_number', 'question_type',
                  'question_text', 'options']
        # correct_answer yo'q — xavfsizlik uchun

class ReadingPassageSerializer(serializers.ModelSerializer):
    questions = ReadingQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingPassage
        fields = ['id', 'passage_number', 'title', 'text', 'questions']

class ReadingTestSerializer(serializers.ModelSerializer):
    passages = ReadingPassageSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingTest
        fields = ['id', 'title', 'passages']

class ReadingAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAttempt
        fields = ['id', 'test', 'answers', 'score', 'submitted_at']
        read_only_fields = ['score', 'submitted_at']