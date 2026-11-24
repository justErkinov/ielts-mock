from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import User

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'phone', 'first_name']
        extra_kwargs = {'first_name': {'required': False}}

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'first_name', 'is_teacher', 'is_superuser']
        read_only_fields = ['is_teacher', 'is_superuser']